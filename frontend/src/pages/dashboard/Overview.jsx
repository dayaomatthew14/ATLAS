import { isAdmin, isDean } from '../../utils/session';
import AdminOverview from './AdminOverview';
import DashboardHome from './DashboardHome';

/**
 * The roles open this app to answer different questions, so /dashboard
 * resolves to two different screens rather than one screen with branches.
 *
 * An administrator or dean asks "what needs me?" — verifications, curriculum gaps,
 * departmental oversight. A chair asks "can I generate yet?" — rooms, faculty, offerings.
 */
export default function Overview() {
  return isAdmin() || isDean() ? <AdminOverview /> : <DashboardHome />;
}
