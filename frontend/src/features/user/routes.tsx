import { Navigate, useNavigate, useParams } from 'react-router';
import { useBookingStore } from '@/stores/bookingStore';
import AvailabilityScreen from './booking/AvailabilityScreen';
import BookingConfirmScreen from './booking/BookingConfirmScreen';
import StartScreen from './home/StartScreen';

export function StartRoute() {
  const navigate = useNavigate();
  const { remainingEntries, totalEntries, upcomingReservation, setPending } = useBookingStore();
  return (
    <StartScreen
      remainingEntries={remainingEntries}
      totalEntries={totalEntries}
      upcomingReservation={upcomingReservation}
      onSelectSport={(id) => { setPending(null); navigate(`/sport/${id}`); }}
    />
  );
}

export function AvailabilityRoute() {
  const { sportId = '' } = useParams();
  const navigate = useNavigate();
  const setPending = useBookingStore((s) => s.setPending);
  return (
    <AvailabilityScreen
      sportId={sportId}
      onBack={() => navigate('/')}
      onContinue={(sel) => { setPending(sel); navigate(`/sport/${sportId}/confirm`); }}
    />
  );
}

export function ConfirmRoute() {
  const { sportId = '' } = useParams();
  const navigate = useNavigate();
  const { pendingBooking, remainingEntries, totalEntries, complete } = useBookingStore();
  if (!pendingBooking) return <Navigate to={`/sport/${sportId}`} replace />;
  return (
    <BookingConfirmScreen
      selection={pendingBooking}
      remainingEntries={remainingEntries}
      totalEntries={totalEntries}
      onBack={() => navigate(`/sport/${sportId}`)}
      onComplete={(r) => { complete(r); navigate('/'); }}
    />
  );
}