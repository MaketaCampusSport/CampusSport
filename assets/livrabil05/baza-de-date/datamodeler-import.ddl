-- CampusSport: modelul bazei de date pentru import in Oracle SQL Developer Data Modeler.
-- File > Import > DDL File. Baza reala este PostgreSQL: vezi schema-postgresql.sql si README.md.

CREATE TABLE users (
    id                       VARCHAR2(36) NOT NULL,
    full_name                VARCHAR2(120) NOT NULL,
    email                    VARCHAR2(254) NOT NULL,
    phone                    VARCHAR2(16),
    role                     VARCHAR2(10) NOT NULL,
    status                   VARCHAR2(10) DEFAULT 'active' NOT NULL,
    suspended_until          TIMESTAMP WITH TIME ZONE,
    sso_subject              VARCHAR2(255),
    email_verified_at        TIMESTAMP WITH TIME ZONE,
    phone_verified_at        TIMESTAMP WITH TIME ZONE,
    totp_secret              VARCHAR2(255),
    calendar_token           VARCHAR2(36) NOT NULL,
    notification_preferences CLOB NOT NULL,
    last_active_at           TIMESTAMP WITH TIME ZONE,
    created_at               TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE users IS 'Membri (SSO), externi (OTP) si administratori';
COMMENT ON COLUMN users.id IS 'uuid in PostgreSQL';
COMMENT ON COLUMN users.sso_subject IS 'NULL pentru externi';
COMMENT ON COLUMN users.totp_secret IS 'Al doilea pas pentru administratori (NFR-08), criptat';
COMMENT ON COLUMN users.calendar_token IS 'Token pentru abonamentul iCal personal (FR-17); uuid in PostgreSQL';
COMMENT ON COLUMN users.notification_preferences IS 'Canale si limba (FR-37); jsonb in PostgreSQL';
COMMENT ON COLUMN users.last_active_at IS 'Pentru stergerea conturilor externe inactive 24 de luni (SDD 5.3)';

ALTER TABLE users ADD CONSTRAINT users_pk PRIMARY KEY ( id );
ALTER TABLE users ADD CONSTRAINT users_email_uq UNIQUE ( email );
ALTER TABLE users ADD CONSTRAINT users_sso_subject_uq UNIQUE ( sso_subject );
ALTER TABLE users ADD CONSTRAINT users_calendar_token_uq UNIQUE ( calendar_token );
ALTER TABLE users ADD CONSTRAINT users_role_ck CHECK ( role IN ( 'student', 'teacher', 'external', 'admin' ) );
ALTER TABLE users ADD CONSTRAINT users_status_ck CHECK ( status IN ( 'active', 'suspended' ) );
ALTER TABLE users ADD CONSTRAINT users_suspended_ck CHECK ( status <> 'suspended' OR suspended_until IS NOT NULL );
ALTER TABLE users ADD CONSTRAINT users_external_phone_ck CHECK ( role <> 'external' OR phone IS NOT NULL );
ALTER TABLE users ADD CONSTRAINT users_sso_ck CHECK ( ( role = 'external' AND sso_subject IS NULL ) OR ( role <> 'external' AND sso_subject IS NOT NULL ) );

CREATE TABLE sports (
    id                 VARCHAR2(36) NOT NULL,
    name_ro            VARCHAR2(60) NOT NULL,
    name_en            VARCHAR2(60) NOT NULL,
    icon               VARCHAR2(60) NOT NULL,
    required_equipment CLOB NOT NULL
);

COMMENT ON TABLE sports IS 'Sporturi; se adauga din panou, fara modificari de cod (NFR-14)';
COMMENT ON COLUMN sports.required_equipment IS 'Lista de dotari; text[] in PostgreSQL';

ALTER TABLE sports ADD CONSTRAINT sports_pk PRIMARY KEY ( id );

CREATE TABLE resources (
    id                      VARCHAR2(36) NOT NULL,
    name                    VARCHAR2(120) NOT NULL,
    type                    VARCHAR2(30) NOT NULL,
    location                VARCHAR2(255) NOT NULL,
    photo_url               VARCHAR2(500),
    capacity                NUMBER(5) NOT NULL,
    equipment               CLOB NOT NULL,
    opening_hours           CLOB NOT NULL,
    slot_minutes            NUMBER(4) DEFAULT 60 NOT NULL,
    external_access         VARCHAR2(10) DEFAULT 'leftover' NOT NULL,
    external_access_windows CLOB,
    active                  NUMBER(1) DEFAULT 1 NOT NULL
);

COMMENT ON TABLE resources IS 'Terenuri, sali si bazine care pot fi rezervate';
COMMENT ON COLUMN resources.equipment IS 'Lista de dotari; text[] in PostgreSQL';
COMMENT ON COLUMN resources.opening_hours IS 'Program saptamanal; jsonb in PostgreSQL';
COMMENT ON COLUMN resources.external_access_windows IS 'Intervale pentru externi cand external_access = window (FR-04); jsonb in PostgreSQL';
COMMENT ON COLUMN resources.active IS 'boolean in PostgreSQL';

ALTER TABLE resources ADD CONSTRAINT resources_pk PRIMARY KEY ( id );
ALTER TABLE resources ADD CONSTRAINT resources_capacity_ck CHECK ( capacity > 0 );
ALTER TABLE resources ADD CONSTRAINT resources_slot_minutes_ck CHECK ( slot_minutes >= 15 );
ALTER TABLE resources ADD CONSTRAINT resources_ext_access_ck CHECK ( external_access IN ( 'never', 'window', 'leftover' ) );
ALTER TABLE resources ADD CONSTRAINT resources_active_ck CHECK ( active IN ( 0, 1 ) );

CREATE TABLE resource_sports (
    resource_id VARCHAR2(36) NOT NULL,
    sport_id    VARCHAR2(36) NOT NULL
);

COMMENT ON TABLE resource_sports IS 'Legatura N:N resursa - sport';

ALTER TABLE resource_sports ADD CONSTRAINT resource_sports_pk PRIMARY KEY ( resource_id, sport_id );

CREATE TABLE recurrences (
    id          VARCHAR2(36) NOT NULL,
    rule        VARCHAR2(255) NOT NULL,
    resource_id VARCHAR2(36) NOT NULL,
    kind        VARCHAR2(12) NOT NULL,
    valid_from  DATE NOT NULL,
    valid_to    DATE NOT NULL,
    source_file VARCHAR2(255)
);

COMMENT ON TABLE recurrences IS 'Reguli recurente, de exemplu orarul EF semestrial';
COMMENT ON COLUMN recurrences.rule IS 'Regula RRULE iCal';

ALTER TABLE recurrences ADD CONSTRAINT recurrences_pk PRIMARY KEY ( id );
ALTER TABLE recurrences ADD CONSTRAINT recurrences_kind_ck CHECK ( kind IN ( 'pe_class', 'event', 'maintenance', 'emergency' ) );
ALTER TABLE recurrences ADD CONSTRAINT recurrences_valid_ck CHECK ( valid_to >= valid_from );

CREATE TABLE occupancy (
    id                 VARCHAR2(36) NOT NULL,
    resource_id        VARCHAR2(36) NOT NULL,
    period_start       TIMESTAMP WITH TIME ZONE NOT NULL,
    period_end         TIMESTAMP WITH TIME ZONE,
    kind               VARCHAR2(12) NOT NULL,
    status             VARCHAR2(10) DEFAULT 'active' NOT NULL,
    user_id            VARCHAR2(36),
    created_by         VARCHAR2(36),
    reason             VARCHAR2(500),
    recurrence_id      VARCHAR2(36),
    cancel_source      VARCHAR2(16),
    checked_in_at      TIMESTAMP WITH TIME ZONE,
    qr_nonce           VARCHAR2(36),
    participants_count NUMBER(5),
    sport_id           VARCHAR2(36),
    anonymized_at      TIMESTAMP WITH TIME ZONE,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE occupancy IS 'Tabelul central: rezervari si blocari. In PostgreSQL, constrangerea de excludere no_overlap interzice doua randuri active suprapuse pe aceeasi resursa (FR-12)';
COMMENT ON COLUMN occupancy.period_start IS 'Inceputul coloanei period (tstzrange in PostgreSQL)';
COMMENT ON COLUMN occupancy.period_end IS 'Sfarsitul coloanei period; NULL inseamna pana la noi ordine, doar la blocari';
COMMENT ON COLUMN occupancy.user_id IS 'Titularul rezervarii; NULL la blocari si dupa anonimizare';
COMMENT ON COLUMN occupancy.qr_nonce IS 'Valoare aleatoare semnata in codul QR';
COMMENT ON COLUMN occupancy.participants_count IS 'Rezervare pentru echipa (FR-18)';
COMMENT ON COLUMN occupancy.sport_id IS 'Necesar doar pentru cota per sport (FR-25)';
COMMENT ON COLUMN occupancy.anonymized_at IS 'Anonimizare dupa 12 luni sau la stergerea contului (SDD 5.3)';

ALTER TABLE occupancy ADD CONSTRAINT occupancy_pk PRIMARY KEY ( id );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_kind_ck CHECK ( kind IN ( 'booking', 'pe_class', 'event', 'maintenance', 'emergency' ) );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_status_ck CHECK ( status IN ( 'active', 'cancelled', 'completed', 'no_show' ) );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_cancel_source_ck CHECK ( cancel_source IN ( 'user', 'admin', 'emergency', 'maintenance', 'pe_class', 'event', 'member_priority' ) );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_cancelled_ck CHECK ( ( status = 'cancelled' AND cancel_source IS NOT NULL ) OR ( status <> 'cancelled' AND cancel_source IS NULL ) );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_owner_ck CHECK ( ( kind = 'booking' AND ( user_id IS NOT NULL OR anonymized_at IS NOT NULL ) ) OR ( kind <> 'booking' AND user_id IS NULL ) );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_qr_ck CHECK ( kind <> 'booking' OR qr_nonce IS NOT NULL );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_participants_ck CHECK ( participants_count > 0 );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_period_order_ck CHECK ( period_end IS NULL OR period_end > period_start );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_period_end_ck CHECK ( kind <> 'booking' OR period_end IS NOT NULL );

CREATE INDEX occupancy_resource_period_idx ON occupancy ( resource_id, period_start, period_end );
CREATE INDEX occupancy_user_status_idx ON occupancy ( user_id, status, period_start );
CREATE INDEX occupancy_recurrence_idx ON occupancy ( recurrence_id );

CREATE TABLE monthly_quota (
    user_id  VARCHAR2(36) NOT NULL,
    month    DATE NOT NULL,
    used     NUMBER(5) DEFAULT 0 NOT NULL,
    refunded NUMBER(5) DEFAULT 0 NOT NULL
);

COMMENT ON TABLE monthly_quota IS 'Contorul lunar de intrari per student (FR-25 - FR-29)';
COMMENT ON COLUMN monthly_quota.month IS 'Prima zi a lunii';

ALTER TABLE monthly_quota ADD CONSTRAINT monthly_quota_pk PRIMARY KEY ( user_id, month );
ALTER TABLE monthly_quota ADD CONSTRAINT monthly_quota_month_ck CHECK ( EXTRACT(DAY FROM month) = 1 );
ALTER TABLE monthly_quota ADD CONSTRAINT monthly_quota_used_ck CHECK ( used >= 0 );
ALTER TABLE monthly_quota ADD CONSTRAINT monthly_quota_refunded_ck CHECK ( refunded >= 0 AND refunded <= used );

CREATE TABLE waitlist (
    id                   VARCHAR2(36) NOT NULL,
    user_id              VARCHAR2(36) NOT NULL,
    resource_id          VARCHAR2(36),
    sport_id             VARCHAR2(36),
    day                  DATE NOT NULL,
    period_start         TIMESTAMP WITH TIME ZONE,
    period_end           TIMESTAMP WITH TIME ZONE,
    priority             NUMBER(1) NOT NULL,
    status               VARCHAR2(10) DEFAULT 'waiting' NOT NULL,
    offered_at           TIMESTAMP WITH TIME ZONE,
    offer_expires_at     TIMESTAMP WITH TIME ZONE,
    offered_resource_id  VARCHAR2(36),
    offered_period_start TIMESTAMP WITH TIME ZONE,
    offered_period_end   TIMESTAMP WITH TIME ZONE,
    created_at           TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE waitlist IS 'Inscrieri pe slot sau abonari la zi + sport (FR-30 - FR-33)';
COMMENT ON COLUMN waitlist.resource_id IS 'NULL inseamna orice resursa compatibila';
COMMENT ON COLUMN waitlist.priority IS '1 profesor, 2 student, 3 extern';
COMMENT ON COLUMN waitlist.offered_resource_id IS 'Resursa din oferta curenta, importanta la abonari';
COMMENT ON COLUMN waitlist.created_at IS 'Ordinea in cadrul aceleiasi prioritati (SDD 7.2)';

ALTER TABLE waitlist ADD CONSTRAINT waitlist_pk PRIMARY KEY ( id );
ALTER TABLE waitlist ADD CONSTRAINT waitlist_priority_ck CHECK ( priority IN ( 1, 2, 3 ) );
ALTER TABLE waitlist ADD CONSTRAINT waitlist_status_ck CHECK ( status IN ( 'waiting', 'offered', 'accepted', 'expired' ) );
ALTER TABLE waitlist ADD CONSTRAINT waitlist_target_ck CHECK ( ( resource_id IS NOT NULL AND period_start IS NOT NULL ) OR ( resource_id IS NULL AND sport_id IS NOT NULL ) );

CREATE INDEX waitlist_match_idx ON waitlist ( day, status, priority, created_at );

CREATE TABLE notifications (
    id           VARCHAR2(36) NOT NULL,
    user_id      VARCHAR2(36) NOT NULL,
    occupancy_id VARCHAR2(36),
    block_id     VARCHAR2(36),
    type         VARCHAR2(30) NOT NULL,
    channel      VARCHAR2(5) NOT NULL,
    payload      CLOB NOT NULL,
    sent_at      TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    error        VARCHAR2(1000),
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE notifications IS 'Mesaje trimise; partitionat lunar in PostgreSQL';
COMMENT ON COLUMN notifications.block_id IS 'Blocarea care a generat mesajul, pentru contorul anuntati / livrati';
COMMENT ON COLUMN notifications.payload IS 'jsonb in PostgreSQL';

ALTER TABLE notifications ADD CONSTRAINT notifications_pk PRIMARY KEY ( id, created_at );
ALTER TABLE notifications ADD CONSTRAINT notifications_channel_ck CHECK ( channel IN ( 'push', 'email', 'sms' ) );

CREATE INDEX notifications_user_idx ON notifications ( user_id, created_at );
CREATE INDEX notifications_block_idx ON notifications ( block_id );

CREATE TABLE push_subscriptions (
    id         VARCHAR2(36) NOT NULL,
    user_id    VARCHAR2(36) NOT NULL,
    endpoint   VARCHAR2(1000) NOT NULL,
    keys       CLOB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE push_subscriptions IS 'Un rand per dispozitiv';
COMMENT ON COLUMN push_subscriptions.keys IS 'jsonb in PostgreSQL';

ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_pk PRIMARY KEY ( id );
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_endpoint_uq UNIQUE ( endpoint );

CREATE TABLE settings (
    key        VARCHAR2(60) NOT NULL,
    value      CLOB NOT NULL,
    updated_by VARCHAR2(36),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE settings IS 'Reguli configurabile: cota, ferestre, termene (FR-46)';
COMMENT ON COLUMN settings.value IS 'jsonb in PostgreSQL';

ALTER TABLE settings ADD CONSTRAINT settings_pk PRIMARY KEY ( key );

CREATE TABLE audit_log (
    id        VARCHAR2(36) NOT NULL,
    actor_id  VARCHAR2(36),
    action    VARCHAR2(60) NOT NULL,
    entity    VARCHAR2(60) NOT NULL,
    entity_id VARCHAR2(36),
    before    CLOB,
    after     CLOB,
    at        TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

COMMENT ON TABLE audit_log IS 'Doar inserare (trigger in PostgreSQL); partitionat lunar';
COMMENT ON COLUMN audit_log.actor_id IS 'NULL pentru actiunile automate ale worker-ului';
COMMENT ON COLUMN audit_log.before IS 'jsonb in PostgreSQL';
COMMENT ON COLUMN audit_log.after IS 'jsonb in PostgreSQL';

ALTER TABLE audit_log ADD CONSTRAINT audit_log_pk PRIMARY KEY ( id, at );

CREATE INDEX audit_log_entity_idx ON audit_log ( entity, entity_id, at );

ALTER TABLE resource_sports ADD CONSTRAINT resource_sports_resource_fk FOREIGN KEY ( resource_id ) REFERENCES resources ( id ) ON DELETE CASCADE;
ALTER TABLE resource_sports ADD CONSTRAINT resource_sports_sport_fk FOREIGN KEY ( sport_id ) REFERENCES sports ( id ) ON DELETE CASCADE;
ALTER TABLE recurrences ADD CONSTRAINT recurrences_resource_fk FOREIGN KEY ( resource_id ) REFERENCES resources ( id );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_resource_fk FOREIGN KEY ( resource_id ) REFERENCES resources ( id );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_user_fk FOREIGN KEY ( user_id ) REFERENCES users ( id );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_created_by_fk FOREIGN KEY ( created_by ) REFERENCES users ( id );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_recurrence_fk FOREIGN KEY ( recurrence_id ) REFERENCES recurrences ( id );
ALTER TABLE occupancy ADD CONSTRAINT occupancy_sport_fk FOREIGN KEY ( sport_id ) REFERENCES sports ( id );
ALTER TABLE monthly_quota ADD CONSTRAINT monthly_quota_user_fk FOREIGN KEY ( user_id ) REFERENCES users ( id ) ON DELETE CASCADE;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_user_fk FOREIGN KEY ( user_id ) REFERENCES users ( id ) ON DELETE CASCADE;
ALTER TABLE waitlist ADD CONSTRAINT waitlist_resource_fk FOREIGN KEY ( resource_id ) REFERENCES resources ( id );
ALTER TABLE waitlist ADD CONSTRAINT waitlist_sport_fk FOREIGN KEY ( sport_id ) REFERENCES sports ( id );
ALTER TABLE waitlist ADD CONSTRAINT waitlist_offered_resource_fk FOREIGN KEY ( offered_resource_id ) REFERENCES resources ( id );
ALTER TABLE notifications ADD CONSTRAINT notifications_user_fk FOREIGN KEY ( user_id ) REFERENCES users ( id ) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_occupancy_fk FOREIGN KEY ( occupancy_id ) REFERENCES occupancy ( id );
ALTER TABLE notifications ADD CONSTRAINT notifications_block_fk FOREIGN KEY ( block_id ) REFERENCES occupancy ( id );
ALTER TABLE push_subscriptions ADD CONSTRAINT push_subscriptions_user_fk FOREIGN KEY ( user_id ) REFERENCES users ( id ) ON DELETE CASCADE;
ALTER TABLE settings ADD CONSTRAINT settings_updated_by_fk FOREIGN KEY ( updated_by ) REFERENCES users ( id ) ON DELETE SET NULL;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_fk FOREIGN KEY ( actor_id ) REFERENCES users ( id );
