import { isAdmin } from '../../utils/session';
import AdminOverview from './AdminOverview';
import DashboardHome from './DashboardHome';

/**
 * The two roles open this app to answer different questions, so /dashboard
 * resolves to two different screens rather than one screen with branches.
 *
 * An administrator asks "what needs me?" — verifications, curriculum gaps,
 * orphaned data. A chair asks "can I generate yet?" — rooms, faculty, offerings.
 * Splitting them here keeps each component's state to what it actually renders;
 * the single component previously fetched both sets on every load and threw
 * half away.
 */
export default function Overview() {
  return isAdmin() ? <AdminOverview /> : <DashboardHome />;
}
