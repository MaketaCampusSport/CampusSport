-- CampusSport: schema bazei de date pentru PostgreSQL 15+ (SDD cap. 5).
-- Acesta este scriptul real al aplicației. Pentru Data Modeler se folosește datamodeler-import.ddl.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name                text NOT NULL,
    email                    text NOT NULL,
    phone                    text,
    role                     text NOT NULL,
    status                   text NOT NULL DEFAULT 'active',
    suspended_until          timestamptz,
    sso_subject              text,
    email_verified_at        timestamptz,
    phone_verified_at        timestamptz,
    totp_secret              text,
    calendar_token           uuid NOT NULL DEFAULT gen_random_uuid(),
    notification_preferences jsonb NOT NULL DEFAULT '{"push": true, "email": true, "sms": false, "language": "ro"}',
    last_active_at           timestamptz,
    created_at               timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT users_email_uq UNIQUE (email),
    CONSTRAINT users_sso_subject_uq UNIQUE (sso_subject),
    CONSTRAINT users_calendar_token_uq UNIQUE (calendar_token),
    CONSTRAINT users_role_ck CHECK (role IN ('student', 'teacher', 'external', 'admin')),
    CONSTRAINT users_status_ck CHECK (status IN ('active', 'suspended')),
    CONSTRAINT users_suspended_ck CHECK (status <> 'suspended' OR suspended_until IS NOT NULL),
    CONSTRAINT users_external_phone_ck CHECK (role <> 'external' OR phone IS NOT NULL),
    CONSTRAINT users_sso_ck CHECK ((role = 'external') = (sso_subject IS NULL))
);

CREATE TABLE sports (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name_ro            text NOT NULL,
    name_en            text NOT NULL,
    icon               text NOT NULL,
    required_equipment text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE resources (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text NOT NULL,
    type                    text NOT NULL,
    location                text NOT NULL,
    photo_url               text,
    capacity                integer NOT NULL,
    equipment               text[] NOT NULL DEFAULT '{}',
    opening_hours           jsonb NOT NULL,
    slot_minutes            integer NOT NULL DEFAULT 60,
    external_access         text NOT NULL DEFAULT 'leftover',
    external_access_windows jsonb,
    active                  boolean NOT NULL DEFAULT true,
    CONSTRAINT resources_capacity_ck CHECK (capacity > 0),
    CONSTRAINT resources_slot_minutes_ck CHECK (slot_minutes >= 15),
    CONSTRAINT resources_ext_access_ck CHECK (external_access IN ('never', 'window', 'leftover'))
);

CREATE TABLE resource_sports (
    resource_id uuid NOT NULL REFERENCES resources (id) ON DELETE CASCADE,
    sport_id    uuid NOT NULL REFERENCES sports (id) ON DELETE CASCADE,
    PRIMARY KEY (resource_id, sport_id)
);

CREATE TABLE recurrences (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule        text NOT NULL,
    resource_id uuid NOT NULL REFERENCES resources (id),
    kind        text NOT NULL,
    valid_from  date NOT NULL,
    valid_to    date NOT NULL,
    source_file text,
    CONSTRAINT recurrences_kind_ck CHECK (kind IN ('pe_class', 'event', 'maintenance', 'emergency')),
    CONSTRAINT recurrences_valid_ck CHECK (valid_to >= valid_from)
);

-- Tabelul central: rezervările și blocările au o singură constrângere anti-suprapunere.
CREATE TABLE occupancy (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id        uuid NOT NULL REFERENCES resources (id),
    period             tstzrange NOT NULL,
    kind               text NOT NULL,
    status             text NOT NULL DEFAULT 'active',
    user_id            uuid REFERENCES users (id),
    created_by         uuid REFERENCES users (id),
    reason             text,
    recurrence_id      uuid REFERENCES recurrences (id),
    cancel_source      text,
    checked_in_at      timestamptz,
    qr_nonce           uuid,
    participants_count integer,
    sport_id           uuid REFERENCES sports (id),
    anonymized_at      timestamptz,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT occupancy_kind_ck CHECK (kind IN ('booking', 'pe_class', 'event', 'maintenance', 'emergency')),
    CONSTRAINT occupancy_status_ck CHECK (status IN ('active', 'cancelled', 'completed', 'no_show')),
    CONSTRAINT occupancy_cancel_source_ck CHECK (cancel_source IN ('user', 'admin', 'emergency', 'maintenance', 'pe_class', 'event', 'member_priority')),
    CONSTRAINT occupancy_cancelled_ck CHECK ((status = 'cancelled') = (cancel_source IS NOT NULL)),
    -- Variantă corectată a regulii din SDD 5.2: rezervările anonimizate (SDD 5.3) rămân fără titular.
    CONSTRAINT occupancy_owner_ck CHECK (
        (kind = 'booking' AND (user_id IS NOT NULL OR anonymized_at IS NOT NULL))
        OR (kind <> 'booking' AND user_id IS NULL)
    ),
    CONSTRAINT occupancy_qr_ck CHECK (kind <> 'booking' OR qr_nonce IS NOT NULL),
    CONSTRAINT occupancy_participants_ck CHECK (participants_count > 0),
    -- lower() este NULL și pentru un interval gol. Doar blocările pot fi „până la noi ordine”.
    CONSTRAINT occupancy_period_start_ck CHECK (lower(period) IS NOT NULL),
    CONSTRAINT occupancy_period_end_ck CHECK (kind <> 'booking' OR upper(period) IS NOT NULL),
    -- Garanția anti-suprapunere (FR-12).
    CONSTRAINT no_overlap EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (status = 'active')
);

CREATE INDEX occupancy_resource_period_idx ON occupancy USING gist (resource_id, period);
CREATE INDEX occupancy_user_status_idx ON occupancy (user_id, status, lower(period));
CREATE INDEX occupancy_recurrence_idx ON occupancy (recurrence_id);

CREATE TABLE monthly_quota (
    user_id  uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month    date NOT NULL,
    used     integer NOT NULL DEFAULT 0,
    refunded integer NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, month),
    CONSTRAINT monthly_quota_month_ck CHECK (EXTRACT(DAY FROM month) = 1),
    CONSTRAINT monthly_quota_used_ck CHECK (used >= 0),
    CONSTRAINT monthly_quota_refunded_ck CHECK (refunded >= 0 AND refunded <= used)
);

CREATE TABLE waitlist (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    resource_id         uuid REFERENCES resources (id),
    sport_id            uuid REFERENCES sports (id),
    day                 date NOT NULL,
    period              tstzrange,
    priority            smallint NOT NULL,
    status              text NOT NULL DEFAULT 'waiting',
    offered_at          timestamptz,
    offer_expires_at    timestamptz,
    offered_resource_id uuid REFERENCES resources (id),
    offered_period      tstzrange,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT waitlist_priority_ck CHECK (priority IN (1, 2, 3)),
    CONSTRAINT waitlist_status_ck CHECK (status IN ('waiting', 'offered', 'accepted', 'expired')),
    -- Înscriere pe slot (resursă + interval) sau abonare la zi + sport.
    CONSTRAINT waitlist_target_ck CHECK (
        (resource_id IS NOT NULL AND period IS NOT NULL)
        OR (resource_id IS NULL AND sport_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX waitlist_active_uq ON waitlist (user_id, resource_id, sport_id, day, period)
    NULLS NOT DISTINCT WHERE status IN ('waiting', 'offered');
CREATE INDEX waitlist_match_idx ON waitlist (day, status, priority, created_at);

-- notifications și audit_log sunt partiționate lunar (SDD 5.2), deci cheia primară include data.
CREATE TABLE notifications (
    id           uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    occupancy_id uuid REFERENCES occupancy (id),
    block_id     uuid REFERENCES occupancy (id),
    type         text NOT NULL,
    channel      text NOT NULL,
    payload      jsonb NOT NULL,
    sent_at      timestamptz,
    delivered_at timestamptz,
    error        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at),
    CONSTRAINT notifications_channel_ck CHECK (channel IN ('push', 'email', 'sms'))
) PARTITION BY RANGE (created_at);

CREATE INDEX notifications_user_idx ON notifications (user_id, created_at);
CREATE INDEX notifications_block_idx ON notifications (block_id);

CREATE TABLE push_subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    endpoint   text NOT NULL,
    keys       jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT push_subscriptions_endpoint_uq UNIQUE (endpoint)
);

CREATE TABLE settings (
    key        text PRIMARY KEY,
    value      jsonb NOT NULL,
    updated_by uuid REFERENCES users (id) ON DELETE SET NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id        uuid NOT NULL DEFAULT gen_random_uuid(),
    actor_id  uuid REFERENCES users (id),
    action    text NOT NULL,
    entity    text NOT NULL,
    entity_id uuid,
    before    jsonb,
    after     jsonb,
    at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (id, at)
) PARTITION BY RANGE (at);

CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id, at);

-- Jurnalul de audit acceptă doar inserări (SDD 5.1). Partițiile vechi se șterg cu DROP TABLE.
CREATE FUNCTION audit_log_insert_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_log accepta doar inserari';
END;
$$;

CREATE TRIGGER audit_log_insert_only_trg BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION audit_log_insert_only();

-- Creează partițiile unei luni; worker-ul o apelează din jobul monthly-reset (SDD 4.1).
CREATE FUNCTION create_monthly_partitions(p_month date) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_from date := date_trunc('month', p_month)::date;
    v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
    v_tbl  text;
BEGIN
    FOREACH v_tbl IN ARRAY ARRAY['notifications', 'audit_log'] LOOP
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
            v_tbl || '_' || to_char(v_from, 'YYYY_MM'), v_tbl, v_from, v_to
        );
    END LOOP;
END;
$$;

CREATE TABLE notifications_default PARTITION OF notifications DEFAULT;
CREATE TABLE audit_log_default PARTITION OF audit_log DEFAULT;

SELECT create_monthly_partitions((date_trunc('month', now()) + make_interval(months => m))::date)
FROM generate_series(0, 2) AS m;

-- Valorile implicite ale regulilor (SRS 9.2), citite la fiecare cerere (SDD 2.1).
INSERT INTO settings (key, value) VALUES
    ('monthly_quota', '4'),
    ('monthly_quota_per_sport', '{}'),
    ('max_active_bookings', '2'),
    ('booking_window_days_student', '7'),
    ('booking_window_days_teacher', '14'),
    ('booking_window_hours_external', '24'),
    ('cancel_free_hours', '2'),
    ('checkin_minutes_before', '10'),
    ('checkin_minutes_after', '15'),
    ('no_show_threshold', '3'),
    ('no_show_suspension_days', '14'),
    ('waitlist_offer_minutes', '10'),
    ('waitlist_simultaneous_under_hours', '2'),
    ('default_slot_minutes', '60'),
    ('member_replaces_external', 'false');
