import { useState, useEffect, useRef } from 'react';
import { Mail, Shield, Building, Pencil, Save, X, Camera } from 'lucide-react';
import { api } from '../../utils/api';
import { useToast } from '../../components/ToastProvider';
import Button from '../../components/ui/Button';
import { TextInput, SelectInput } from '../../components/ui/Field';
import { Page, PageHeader, Panel } from '../../components/ui/Page';
import { ROLE_LABELS, resolveDepartment, focusRing } from '../../components/ui/tokens';

/**
 * Profile.
 *
 * Converted onto the design system. It had its own type scale (`text-3xl
 * font-black tracking-tighter`), its own greys (`text-gray-400` where the rest
 * of the app uses `text-atlas-slate`), its own inputs — hand-rolled with
 * `rounded-2xl` and an unlabelled `<select>` — and its own two accent colours
 * for the department and role cards, blue among them, which appears nowhere
 * else in ATLAS.
 *
 * Read and edit are now the same layout rather than two different ones, so
 * pressing Edit changes what the fields do, not where they are.
 */

const getProfilePictureUrl = (path) => {
  if (!path) return '';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const apiUrl = import.meta.env.VITE_API_URL;
  if (apiUrl && apiUrl.startsWith('http')) {
    try {
      return `${new URL(apiUrl).origin}${cleanPath}`;
    } catch (e) {
      console.error(e);
    }
  }
  return cleanPath;
};

/** A read-only value, shaped like the Field it replaces so nothing jumps. */
function ReadField({ label, value, icon: Icon, muted = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ui text-micro uppercase text-atlas-slate">{label}</span>
      <p
        className={`h-10 px-3 rounded-field border border-atlas-line flex items-center gap-2 min-w-0
                    font-ui text-body ${muted ? 'bg-atlas-canvas text-atlas-slate' : 'bg-white/70 text-atlas-ink'}`}
        title={typeof value === 'string' ? value : undefined}
      >
        {Icon && <Icon className="w-4 h-4 text-atlas-slate shrink-0" aria-hidden="true" />}
        <span className="truncate">
          {value || <span className="text-atlas-disabled">Not specified</span>}
        </span>
      </p>
    </div>
  );
}

export default function Profile() {
  const { addToast } = useToast();
  const [user, setUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({});
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchProfile();
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response);
      setFormData({
        first_name: response.first_name || '',
        last_name: response.last_name || '',
        contact_number: response.contact_number || '',
        sex: response.sex || '',
        date_of_birth: response.date_of_birth || '',
      });
      // Synchronize localStorage with fresh data
      localStorage.setItem('atlas_user_name', `${response.first_name || ''} ${response.last_name || ''}`.trim());
      if (response.profile_picture) {
        localStorage.setItem('atlas_profile_picture', response.profile_picture);
      } else {
        localStorage.removeItem('atlas_profile_picture');
      }
    } catch (e) {
      addToast('Failed to load profile', 'error');
    }
  };

  const handleSave = async () => {
    if (!formData.first_name || !formData.first_name.trim()) {
      addToast('First name is required', 'error');
      return;
    }
    const nameRegex = /^[A-Za-z\s.]+$/;
    if (!nameRegex.test(formData.first_name)) {
      addToast('First name can only contain letters, spaces, and periods', 'error');
      return;
    }

    if (!formData.last_name || !formData.last_name.trim()) {
      addToast('Last name is required', 'error');
      return;
    }
    if (!nameRegex.test(formData.last_name)) {
      addToast('Last name can only contain letters, spaces, and periods', 'error');
      return;
    }

    if (formData.contact_number) {
      const phoneRegex = /^(09\d{9}|\+639\d{9})$/;
      if (!phoneRegex.test(formData.contact_number)) {
        addToast('Contact number must be a valid PH mobile number (e.g., 09123456789)', 'error');
        return;
      }
    }

    setIsSaving(true);
    try {
      const cleanData = { ...formData };
      if (cleanData.contact_number === '') cleanData.contact_number = null;
      if (cleanData.sex === '') cleanData.sex = null;
      if (cleanData.date_of_birth === '') cleanData.date_of_birth = null;

      await api.put(`/users/${user.id}`, cleanData);
      addToast('Profile updated successfully', 'success');

      // Update local storage name if it changed
      localStorage.setItem('atlas_user_name', `${cleanData.first_name} ${cleanData.last_name}`.trim());
      window.dispatchEvent(new Event('atlas_profile_updated'));

      setIsEditing(false);
      fetchProfile();
    } catch (e) {
      addToast('Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePictureClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formDataObj = new FormData();
    formDataObj.append('file', file);

    try {
      const res = await api.post(`/users/${user.id}/upload-picture`, formDataObj);
      setUser((prev) => ({ ...prev, profile_picture: res.url }));
      localStorage.setItem('atlas_profile_picture', res.url);
      window.dispatchEvent(new Event('atlas_profile_updated'));
      addToast('Profile picture updated', 'success');
    } catch (err) {
      addToast('Failed to upload picture', 'error');
    }
  };

  if (!user) {
    return (
      <Page>
        <div className="flex flex-col gap-4" aria-busy="true">
          <div className="h-10 w-56 rounded-field bg-atlas-line animate-pulse motion-reduce:animate-none" />
          <div className="h-96 glass rounded-panel animate-pulse motion-reduce:animate-none" />
          <span className="sr-only">Loading your profile…</span>
        </div>
      </Page>
    );
  }

  const initials =
    ((user.first_name ? user.first_name[0] : '') + (user.last_name ? user.last_name[0] : '')).toUpperCase() || 'U';
  const college = resolveDepartment(user.department);

  return (
    <Page className="max-w-5xl">
      <PageHeader
        title="My Profile"
        meta="Your account details, as the rest of the university sees them."
        actions={
          isEditing ? (
            <>
              <Button variant="ghost" icon={X} onClick={() => setIsEditing(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button icon={Save} onClick={handleSave} loading={isSaving}>
                Save Changes
              </Button>
            </>
          ) : (
            <Button variant="secondary" icon={Pencil} onClick={() => setIsEditing(true)}>
              Edit Profile
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel className="rise" bodyClassName="p-6 flex flex-col items-center text-center">
          <button
            type="button"
            onClick={isEditing ? handlePictureClick : undefined}
            aria-label={isEditing ? 'Upload a profile picture' : undefined}
            disabled={!isEditing}
            className={`relative w-32 h-32 rounded-full overflow-hidden bg-atlas-100 border border-white/70
                        flex items-center justify-center group
                        ${isEditing ? `cursor-pointer lift ${focusRing}` : 'cursor-default'}`}
          >
            {user.profile_picture ? (
              <img
                src={getProfilePictureUrl(user.profile_picture)}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="font-display text-page text-atlas-700">{initials}</span>
            )}

            {isEditing && (
              <span
                className="absolute inset-0 bg-atlas-900/65 backdrop-blur-[2px] flex flex-col items-center justify-center
                           gap-1 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100
                           transition-opacity duration-state ease-standard"
              >
                <Camera className="w-6 h-6 text-white" aria-hidden="true" />
                <span className="font-ui text-caption text-white">Change</span>
              </span>
            )}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept="image/*"
          />

          <h2 className="font-display text-section text-atlas-ink mt-4">
            {user.first_name} {user.last_name}
          </h2>
          <p className="font-ui text-caption text-atlas-slate mt-1">
            {ROLE_LABELS[user.role] || user.role}
          </p>

          <dl className="w-full mt-6 pt-5 border-t border-white/45 flex flex-col gap-4 text-left">
            <div className="flex items-center gap-3 min-w-0">
              <Building className="w-4 h-4 text-atlas-slate shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="font-ui text-micro uppercase text-atlas-slate">College</dt>
                <dd className="font-ui text-body text-atlas-ink truncate" title={user.department_name || user.department}>
                  {user.department_name || college.code || 'Not assigned'}
                </dd>
              </div>
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <Shield className="w-4 h-4 text-atlas-slate shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <dt className="font-ui text-micro uppercase text-atlas-slate">Access level</dt>
                <dd className="font-ui text-body text-atlas-ink truncate">
                  {ROLE_LABELS[user.role] || user.role}
                </dd>
              </div>
            </div>
          </dl>
        </Panel>

        <Panel
          className="lg:col-span-2 rise"
          title="Personal information"
          description={isEditing ? 'Update your details, then save.' : 'Your school email is set by an administrator and cannot be changed here.'}
          bodyClassName="p-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {isEditing ? (
              <>
                <TextInput
                  label="First name"
                  required
                  value={formData.first_name}
                  onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                />
                <TextInput
                  label="Last name"
                  required
                  value={formData.last_name}
                  onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                />
                <SelectInput
                  label="Sex"
                  value={formData.sex}
                  onChange={(e) => setFormData({ ...formData, sex: e.target.value })}
                  options={[
                    { value: '', label: 'Prefer not to say' },
                    { value: 'Male', label: 'Male' },
                    { value: 'Female', label: 'Female' },
                    { value: 'Other', label: 'Other' },
                  ]}
                />
                <TextInput
                  label="Date of birth"
                  type="date"
                  value={formData.date_of_birth}
                  onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                />
                <TextInput
                  label="Contact number"
                  hint="Philippine mobile, e.g. 09123456789"
                  value={formData.contact_number}
                  onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                />
              </>
            ) : (
              <>
                <ReadField label="First name" value={user.first_name} />
                <ReadField label="Last name" value={user.last_name} />
                <ReadField label="Sex" value={user.sex} />
                <ReadField label="Date of birth" value={user.date_of_birth} />
                <ReadField label="Contact number" value={user.contact_number} />
              </>
            )}

            {/* Never editable, in either mode. */}
            <ReadField label="School email address" value={user.email} icon={Mail} muted />
          </div>
        </Panel>
      </div>
    </Page>
  );
}
