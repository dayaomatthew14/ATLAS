import { isAdmin } from '../../utils/session';
import CurriculumIndex from './CurriculumIndex';
import Curriculum from './Curriculum';

/**
 * /dashboard/curriculum resolves to two different screens.
 *
 * The administrator maintains the catalog — adding, editing and removing
 * subjects term by term so a curriculum can be revised for a new intake year.
 * A chair reads it and assigns offerings from it. Those are different jobs on
 * the same data, and giving each its own component keeps the editing surface
 * out of the read path entirely rather than gating it behind role checks
 * sprinkled through one screen.
 */
export default function CurriculumRoute() {
  return isAdmin() ? <CurriculumIndex /> : <Curriculum />;
}
