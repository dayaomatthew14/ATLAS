import { useMemo, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import { ConfirmDialog } from '../../components/ui/Dialog';
import Button from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { focusRing } from '../../components/ui/tokens';
import { landingViewsFor, getLandingView } from '../../utils/session';

/**
 * Settings.
 *
 * This screen previously offered five groups of controls, of which two worked.
 * Notification preferences, security questions, the auto-logout timeout, the
 * default schedule layout, the calendar start day and the safety-confirmation
 * toggle all wrote to localStorage and were read by nothing — no screen and no
 * API endpoint consumed any of them. A setting that silently does nothing is
 * worse than an absent one, because the user believes the system is configured.
 * Only controls with a real effect remain; see the cleanup notes for the list.
 */

// Keep in sync with MIN_PASSWORD_LENGTH in backend/app/schemas.py
const MIN_PASSWORD_LENGTH = 12;

const DENSITIES = [
  { value: 'comfortable', label: 'Comfortable', hint: 'Taller rows, easier to scan' },
  { value: 'compact', label: 'Compact', hint: 'More rows on screen at once' },
];

function Section({ title, description, children, footer }) {
  return (
    <section className="glass rounded-panel">
      <div className="px-6 pt-6 pb-4">
        <h2 className="font-display text-section text-atlas-ink">{title}</h2>
        {description && (
          <p className="mt-1 font-ui text-body text-atlas-slate">{description}</p>
        )}
      </div>
      <div className="px-6 pb-6">{children}</div>
      {footer && (
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-white/40 bg-white/30 rounded-b-panel">
          {footer}
        </div>
      )}
    </section>
  );
}

/** Password field with a reveal toggle that reports its own state. */
function PasswordInput({ label, hint, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} hint={hint}>
      {({ id, describedBy }) => (
        <div className="relative">
          <input
            id={id}
            type={visible ? 'text' : 'password'}
            value={value}
            onChange={onChange}
            autoComplete={autoComplete}
            aria-describedby={describedBy}
            className={`w-full h-10 pl-3 pr-11 rounded-field font-ui text-body text-atlas-ink
                        bg-white/70 backdrop-blur-sm border border-atlas-control placeholder:text-atlas-disabled
                        hover:border-atlas-slate transition-colors duration-state ease-standard ${focusRing}`}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className={`absolute inset-y-0 right-0 w-10 flex items-center justify-center
                        text-atlas-slate hover:text-atlas-ink rounded-r-field ${focusRing}`}
          >
            {visible ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
          </button>
        </div>
      )}
    </Field>
  );
}

export default function Settings() {
  const { addToast } = useToast();

  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [isSavingWorkspace, setIsSavingWorkspace] = useState(false);
  const [isEndingSessions, setIsEndingSessions] = useState(false);
  const [isLogoutAllOpen, setIsLogoutAllOpen] = useState(false);

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Only the start pages this role can open — Schedule is not one of them for
  // an administrator, and a radio that lands on a 403 is worse than no radio.
  const landingViews = useMemo(() => landingViewsFor(), []);
  const [landingPage, setLandingPage] = useState(getLandingView);
  const [density, setDensity] = useState(
    () => localStorage.getItem('atlas_density') || 'comfortable'
  );

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || !confirmPassword) {
      addToast('Fill in all three password fields.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      addToast('The new passwords do not match.', 'error');
      return;
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      addToast(`Your new password must be at least ${MIN_PASSWORD_LENGTH} characters.`, 'error');
      return;
    }
    if (newPassword !== newPassword.trim()) {
      addToast('Your new password cannot start or end with a space.', 'error');
      return;
    }

    setIsSavingPassword(true);
    try {
      await api.post('/users/change-password', {
        old_password: oldPassword,
        new_password: newPassword,
      });
      addToast('Password updated.', 'success');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      addToast(err.message || 'Could not update your password.', 'error');
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleSaveWorkspace = () => {
    setIsSavingWorkspace(true);
    localStorage.setItem('atlas_pref_landing_view', landingPage);
    localStorage.setItem('atlas_density', density);
    // The top bar owns the live density attribute; keep them in step so the
    // two controls can never disagree.
    if (density === 'compact') document.documentElement.setAttribute('data-density', 'compact');
    else document.documentElement.removeAttribute('data-density');
    setIsSavingWorkspace(false);
    addToast('Workspace preferences saved.', 'success');
  };

  const confirmLogoutAllDevices = async () => {
    setIsEndingSessions(true);
    try {
      await api.post('/auth/logout-all', {});
      addToast('Signed out on all other devices.', 'success');
      setIsLogoutAllOpen(false);
    } catch (err) {
      addToast(err.message || 'Could not end the other sessions.', 'error');
    } finally {
      setIsEndingSessions(false);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-3xl mx-auto">
      <header className="mb-6">
        <h1 className="font-display text-page text-atlas-ink">Settings</h1>
        <p className="font-ui text-body text-atlas-slate mt-1">
          Your password, sessions, and how this workspace opens.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <Section
          title="Workspace"
          description="Applies to this browser only."
          footer={
            <Button onClick={handleSaveWorkspace} loading={isSavingWorkspace}>
              Save Preferences
            </Button>
          }
        >
          <div className="flex flex-col gap-6">
            <fieldset>
              <legend className="font-ui text-micro uppercase text-atlas-slate mb-2">
                Page to open after signing in
              </legend>
              <div className="flex flex-col gap-2">
                {landingViews.map((view) => (
                  <label
                    key={view.value}
                    className="flex items-center gap-2.5 cursor-pointer font-ui text-body text-atlas-ink"
                  >
                    <input
                      type="radio"
                      name="landing-view"
                      value={view.value}
                      checked={landingPage === view.value}
                      onChange={() => setLandingPage(view.value)}
                      className={`w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
                    />
                    {view.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="font-ui text-micro uppercase text-atlas-slate mb-2">
                Table and timetable density
              </legend>
              <div className="flex flex-col gap-2">
                {DENSITIES.map((d) => (
                  <label
                    key={d.value}
                    className="flex items-start gap-2.5 cursor-pointer font-ui text-body text-atlas-ink"
                  >
                    <input
                      type="radio"
                      name="density"
                      value={d.value}
                      checked={density === d.value}
                      onChange={() => setDensity(d.value)}
                      className={`mt-0.5 w-4 h-4 shrink-0 accent-[var(--atlas-green-700)] ${focusRing}`}
                    />
                    <span>
                      {d.label}
                      <span className="block text-caption text-atlas-slate">{d.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
        </Section>

        <Section
          title="Change password"
          description={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          footer={
            <Button type="submit" form="password-form" loading={isSavingPassword}>
              Change Password
            </Button>
          }
        >
          <form id="password-form" onSubmit={handleChangePassword} className="flex flex-col gap-5">
            <PasswordInput
              label="Current password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              autoComplete="current-password"
            />
            <PasswordInput
              label="New password"
              hint={`At least ${MIN_PASSWORD_LENGTH} characters`}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <PasswordInput
              label="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
          </form>
        </Section>

        <Section
          title="Other sessions"
          description="Sign out everywhere you are still signed in. This device stays signed in."
          footer={
            <Button variant="destructive" onClick={() => setIsLogoutAllOpen(true)}>
              Sign Out Other Devices
            </Button>
          }
        >
          <p className="font-ui text-body text-atlas-slate">
            Use this if you signed in on a shared or public computer and did not sign out.
          </p>
        </Section>
      </div>

      <ConfirmDialog
        isOpen={isLogoutAllOpen}
        onClose={() => setIsLogoutAllOpen(false)}
        onConfirm={confirmLogoutAllDevices}
        title="Sign out on all other devices?"
        description="Anyone signed in as you elsewhere will be signed out. This device stays signed in."
        confirmLabel="Sign Out Everywhere"
        destructive
        loading={isEndingSessions}
      />
    </div>
  );
}
