import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '../../components/input';
import { Button } from '../../components/button';
import { Textarea } from '../../components/textarea';
import { useAuth } from '../../hooks/useAuth';
import { useUserProfile, type ProfileSection } from '../../hooks/useUserProfile';
import {
  EMPTY_CHILD,
  EMPTY_EDUCATION,
  EMPTY_ELIGIBILITY,
  EMPTY_WORK,
  EMPTY_LEARNING,
} from '../../services/userProfileService';
import {
  UserIcon,
  UsersIcon,
  AcademicCapIcon,
  IdentificationIcon,
  BriefcaseIcon,
  HeartIcon,
  UserGroupIcon,
  EnvelopeIcon,
  BuildingLibraryIcon,
  CalendarDaysIcon,
  CameraIcon,
  CheckBadgeIcon,
  PlusIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const tabs: { id: ProfileSection; name: string; description: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'personal', name: 'Personal Info', description: 'Basic details & IDs', icon: UserIcon },
  { id: 'family', name: 'Family Background', description: 'Spouse & parents', icon: UsersIcon },
  { id: 'children', name: 'Children', description: 'Dependents', icon: UserGroupIcon },
  { id: 'education', name: 'Educational Background', description: 'Schools & degrees', icon: AcademicCapIcon },
  { id: 'civil', name: 'Civil Service Eligibility', description: 'Exams & ratings', icon: IdentificationIcon },
  { id: 'work', name: 'Work Experience', description: 'Employment history', icon: BriefcaseIcon },
  { id: 'learning', name: 'Learning & Development', description: 'Trainings attended', icon: HeartIcon },
];

// ---- Small presentational helpers -------------------------------------------

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600 ring-1 ring-inset ring-primary-100">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-xs text-gray-500">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function TabPanel({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-6"
    >
      {children}
    </motion.div>
  );
}

/** A removable card wrapping one entry of a repeatable list. */
function EntryCard({
  index,
  onRemove,
  children,
}: {
  index: number;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          Entry {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-gray-400 transition hover:bg-red-50 hover:text-red-600"
          aria-label={`Remove entry ${index + 1}`}
        >
          <XMarkIcon className="h-4 w-4" />
          Remove
        </button>
      </div>
      {children}
    </div>
  );
}

function EmptyList({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-6 text-center text-sm text-gray-500">
      {message}
    </p>
  );
}

export default function UserProfile() {
  const { user, currentAcademicYear } = useAuth();
  const [activeTab, setActiveTab] = useState<ProfileSection>('personal');

  const profile = useUserProfile();
  const {
    personal,
    setPersonal,
    family,
    setFamily,
    children,
    setChildren,
    education,
    setEducation,
    eligibility,
    setEligibility,
    work,
    setWork,
    learning,
    setLearning,
    isDirty,
    hasContent,
    isSaving,
    saveSection,
    resetSection,
  } = profile;

  // ---- Field binding helpers ------------------------------------------------
  const bindPersonal = (field: keyof typeof personal) => ({
    value: personal[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setPersonal((prev) => ({ ...prev, [field]: e.target.value })),
  });

  const bindFamily = (field: keyof typeof family) => ({
    value: family[field],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setFamily((prev) => ({ ...prev, [field]: e.target.value })),
  });

  /** Binds one field of one row in a repeatable list. */
  function bindRow<T>(
    rows: T[],
    setRows: React.Dispatch<React.SetStateAction<T[]>>,
    index: number,
    field: keyof T
  ) {
    return {
      value: (rows[index][field] as unknown as string) ?? '',
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const next = e.target.value;
        setRows((prev) =>
          prev.map((row, i) => (i === index ? { ...row, [field]: next } : row))
        );
      },
    };
  }

  function addRow<T>(setRows: React.Dispatch<React.SetStateAction<T[]>>, template: T) {
    setRows((prev) => [...prev, { ...template }]);
  }

  function removeRow<T>(setRows: React.Dispatch<React.SetStateAction<T[]>>, index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  // ---- Derive header info from the authenticated user -----------------------
  const fullName =
    [user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ') || 'Your Profile';

  const initials =
    [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('').toUpperCase() ||
    fullName.slice(0, 2).toUpperCase();

  const roleTitle = user?.role?.title || 'Member';
  const email = user?.email as string | undefined;
  const avatarUrl = (user?.avatar || user?.profile_picture) as string | undefined;

  // ---- Photo upload (client-side preview + compression) ---------------------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | undefined>(avatarUrl);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const openFilePicker = () => fileInputRef.current?.click();

  const handlePhotoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Allow re-selecting the same file later
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be smaller than 5 MB.');
      return;
    }

    setPhotoError(null);
    setIsUploadingPhoto(true);

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      // Resize to a max of 800x800 to keep the preview light
      const MAX = 800;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        } else {
          width = Math.round((width * MAX) / height);
          height = MAX;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      setPhotoPreview(canvas.toDataURL('image/jpeg', 0.85));
      setIsUploadingPhoto(false);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setPhotoError('We could not read that image. Try another file.');
      setIsUploadingPhoto(false);
    };
    img.src = objectUrl;
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(undefined);
    setPhotoError(null);
  };

  const institutionName = useMemo(() => {
    const list = user?.user_institutions;
    if (!list?.length) return undefined;
    const def = list.find((ui: any) => ui.is_default) ?? list[0];
    return def?.institution?.name as string | undefined;
  }, [user]);

  const completedTabs = tabs.filter((tab) => hasContent(tab.id));
  const completion = Math.round((completedTabs.length / tabs.length) * 100);
  const activeIndex = tabs.findIndex((t) => t.id === activeTab);

  // ---- Save bar -------------------------------------------------------------
  const SaveBar = ({ section, label }: { section: ProfileSection; label: string }) => {
    const dirty = isDirty(section);
    const saving = isSaving(section);
    return (
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-gray-100 pt-5">
        {dirty && !saving && (
          <span className="mr-auto text-xs font-medium text-amber-600">Unsaved changes</span>
        )}
        <Button
          variant="ghost"
          color="secondary"
          type="button"
          disabled={!dirty || saving}
          onClick={() => resetSection(section)}
        >
          Cancel
        </Button>
        <Button
          color="primary"
          type="button"
          loading={saving}
          disabled={!dirty || saving || profile.isLoading}
          onClick={() => saveSection(section)}
          leftIcon={<CheckCircleIcon className="h-5 w-5" />}
        >
          {label}
        </Button>
      </div>
    );
  };

  // ---- Tab content ----------------------------------------------------------
  const renderPersonalInfo = () => (
    <TabPanel id="personal">
      <SectionCard title="Personal Information" subtitle="Government IDs and contact details" icon={UserIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Place of Birth" placeholder="Enter place of birth" {...bindPersonal('place_of_birth')} />
          <Input label="Civil Status" placeholder="Enter civil status" {...bindPersonal('civil_status')} />
          <Input label="Height" placeholder="Enter height (cm)" {...bindPersonal('height')} />
          <Input label="Weight" placeholder="Enter weight (kg)" {...bindPersonal('weight')} />
          <Input label="Blood Type" placeholder="Enter blood type" {...bindPersonal('blood_type')} />
          <Input label="GSIS ID" placeholder="Enter GSIS ID" {...bindPersonal('gsis_id')} />
          <Input label="PAG-IBIG ID" placeholder="Enter PAG-IBIG ID" {...bindPersonal('pag_ibig_id')} />
          <Input label="PhilHealth ID" placeholder="Enter PhilHealth ID" {...bindPersonal('philhealth_id')} />
          <Input label="SSS" placeholder="Enter SSS number" {...bindPersonal('sss')} />
          <Input label="TIN" placeholder="Enter TIN" {...bindPersonal('tin')} />
          <Input label="Agency Employee ID" placeholder="Enter agency employee ID" {...bindPersonal('agency_employee_id')} />
          <Input label="Telephone No." placeholder="Enter telephone number" {...bindPersonal('telephone_no')} />
          <Input label="Mobile No." placeholder="Enter mobile number" {...bindPersonal('mobile_no')} />
        </div>
        <div className="mt-6">
          <SaveBar section="personal" label="Save Personal Info" />
        </div>
      </SectionCard>
    </TabPanel>
  );

  const renderFamilyBackground = () => (
    <TabPanel id="family">
      <SectionCard title="Spouse" subtitle="Details of your spouse" icon={UsersIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="First Name" placeholder="Enter spouse's first name" {...bindFamily('spouse_first_name')} />
          <Input label="Middle Name" placeholder="Enter spouse's middle name" {...bindFamily('spouse_middle_name')} />
          <Input label="Last Name" placeholder="Enter spouse's last name" {...bindFamily('spouse_last_name')} />
          <Input label="Extension Name" placeholder="Enter spouse's extension name" {...bindFamily('spouse_extension_name')} />
          <Input label="Occupation" placeholder="Enter spouse's occupation" {...bindFamily('spouse_occupation')} />
          <Input label="Employer/Business Name" placeholder="Enter spouse's employer/business name" {...bindFamily('spouse_employer')} />
          <Input label="Business Address" placeholder="Enter spouse's business address" {...bindFamily('spouse_business_address')} />
          <Input label="Telephone No." placeholder="Enter spouse's telephone number" {...bindFamily('spouse_telephone')} />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Father" subtitle="Father's name" icon={UserIcon}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="First Name" placeholder="Enter father's first name" {...bindFamily('father_first_name')} />
            <Input label="Middle Name" placeholder="Enter father's middle name" {...bindFamily('father_middle_name')} />
            <Input label="Last Name" placeholder="Enter father's last name" {...bindFamily('father_last_name')} />
            <Input label="Extension Name" placeholder="Enter father's extension name" {...bindFamily('father_extension_name')} />
          </div>
        </SectionCard>

        <SectionCard title="Mother" subtitle="Mother's maiden name" icon={UserIcon}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="First Name" placeholder="Enter mother's first name" {...bindFamily('mother_first_name')} />
            <Input label="Middle Name" placeholder="Enter mother's middle name" {...bindFamily('mother_middle_name')} />
            <Input label="Last Name" placeholder="Enter mother's last name" {...bindFamily('mother_last_name')} />
            <Input label="Extension Name" placeholder="Enter mother's extension name" {...bindFamily('mother_extension')} />
          </div>
        </SectionCard>
      </div>

      <SaveBar section="family" label="Save Family Background" />
    </TabPanel>
  );

  const renderChildren = () => (
    <TabPanel id="children">
      <SectionCard title="Children" subtitle="List your dependents in chronological order" icon={UserGroupIcon}>
        <div className="space-y-4">
          {children.length === 0 && <EmptyList message="No children added yet." />}
          {children.map((_, index) => (
            <EntryCard key={index} index={index} onRemove={() => removeRow(setChildren, index)}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Child Name"
                  placeholder="Enter child's name"
                  {...bindRow(children, setChildren, index, 'children_name')}
                />
                <Input
                  label="Birthday"
                  type="date"
                  {...bindRow(children, setChildren, index, 'date_of_birth')}
                />
              </div>
            </EntryCard>
          ))}
        </div>
        <Button
          variant="outline"
          color="primary"
          type="button"
          className="mt-4"
          onClick={() => addRow(setChildren, EMPTY_CHILD)}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add Child
        </Button>
      </SectionCard>
      <SaveBar section="children" label="Save Children" />
    </TabPanel>
  );

  const renderEducation = () => (
    <TabPanel id="education">
      <SectionCard title="Educational Background" subtitle="From elementary to graduate studies" icon={AcademicCapIcon}>
        <div className="space-y-4">
          {education.length === 0 && <EmptyList message="No schools added yet." />}
          {education.map((_, index) => (
            <EntryCard key={index} index={index} onRemove={() => removeRow(setEducation, index)}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="School Name"
                  placeholder="Enter school name"
                  {...bindRow(education, setEducation, index, 'school_name')}
                />
                <Input
                  label="Degree"
                  placeholder="Enter degree"
                  {...bindRow(education, setEducation, index, 'degree')}
                />
                <Input
                  label="Year Graduated"
                  placeholder="YYYY"
                  type="number"
                  {...bindRow(education, setEducation, index, 'year_graduated')}
                />
                <Input
                  label="Honors/Awards"
                  placeholder="Enter honors/awards"
                  {...bindRow(education, setEducation, index, 'honors')}
                />
              </div>
            </EntryCard>
          ))}
        </div>
        <Button
          variant="outline"
          color="primary"
          type="button"
          className="mt-4"
          onClick={() => addRow(setEducation, EMPTY_EDUCATION)}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add Education
        </Button>
      </SectionCard>
      <SaveBar section="education" label="Save Educational Background" />
    </TabPanel>
  );

  const renderCivilService = () => (
    <TabPanel id="civil">
      <SectionCard title="Civil Service Eligibility" subtitle="Career service & other eligibilities" icon={IdentificationIcon}>
        <div className="space-y-4">
          {eligibility.length === 0 && <EmptyList message="No eligibilities added yet." />}
          {eligibility.map((_, index) => (
            <EntryCard key={index} index={index} onRemove={() => removeRow(setEligibility, index)}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Eligibility Type"
                  placeholder="Enter eligibility type"
                  {...bindRow(eligibility, setEligibility, index, 'eligibility_type')}
                />
                <Input
                  label="Rating"
                  placeholder="Enter rating"
                  {...bindRow(eligibility, setEligibility, index, 'rating')}
                />
                <Input
                  label="Date of Exam"
                  type="date"
                  {...bindRow(eligibility, setEligibility, index, 'date_of_exam')}
                />
                <Input
                  label="Place of Exam"
                  placeholder="Enter place of exam"
                  {...bindRow(eligibility, setEligibility, index, 'place_of_exam')}
                />
              </div>
            </EntryCard>
          ))}
        </div>
        <Button
          variant="outline"
          color="primary"
          type="button"
          className="mt-4"
          onClick={() => addRow(setEligibility, EMPTY_ELIGIBILITY)}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add Eligibility
        </Button>
      </SectionCard>
      <SaveBar section="civil" label="Save Civil Service Eligibility" />
    </TabPanel>
  );

  const renderWorkExperience = () => (
    <TabPanel id="work">
      <SectionCard title="Work Experience" subtitle="Start with your most recent position" icon={BriefcaseIcon}>
        <div className="space-y-4">
          {work.length === 0 && <EmptyList message="No work experience added yet." />}
          {work.map((_, index) => (
            <EntryCard key={index} index={index} onRemove={() => removeRow(setWork, index)}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Input
                  label="Company Name"
                  placeholder="Enter company name"
                  {...bindRow(work, setWork, index, 'company_name')}
                />
                <Input
                  label="Position"
                  placeholder="Enter position"
                  {...bindRow(work, setWork, index, 'position')}
                />
                <Input label="Start Date" type="date" {...bindRow(work, setWork, index, 'start_date')} />
                <Input label="End Date" type="date" {...bindRow(work, setWork, index, 'end_date')} />
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700">Duties/Responsibilities</label>
                  <Textarea
                    placeholder="Describe duties and responsibilities"
                    {...bindRow(work, setWork, index, 'duties')}
                  />
                </div>
              </div>
            </EntryCard>
          ))}
        </div>
        <Button
          variant="outline"
          color="primary"
          type="button"
          className="mt-4"
          onClick={() => addRow(setWork, EMPTY_WORK)}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add Work Experience
        </Button>
      </SectionCard>
      <SaveBar section="work" label="Save Work Experience" />
    </TabPanel>
  );

  const renderLearningDevelopment = () => (
    <TabPanel id="learning">
      <SectionCard title="Learning & Development" subtitle="Trainings, seminars and interventions" icon={HeartIcon}>
        <div className="space-y-4">
          {learning.length === 0 && <EmptyList message="No trainings added yet." />}
          {learning.map((_, index) => (
            <EntryCard key={index} index={index} onRemove={() => removeRow(setLearning, index)}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Input
                    label="Title of Learning and Development Interventions/Training Programs"
                    placeholder="Enter title"
                    {...bindRow(learning, setLearning, index, 'title')}
                  />
                </div>
                <Input
                  label="Inclusive Dates of Attendance From"
                  type="date"
                  {...bindRow(learning, setLearning, index, 'date_from')}
                />
                <Input
                  label="Inclusive Dates of Attendance To"
                  type="date"
                  {...bindRow(learning, setLearning, index, 'date_to')}
                />
                <Input
                  label="Number of Hours"
                  placeholder="Enter number of hours"
                  type="number"
                  {...bindRow(learning, setLearning, index, 'number_of_hours')}
                />
                <Input
                  label="Type of L.D"
                  placeholder="Enter type of L.D"
                  {...bindRow(learning, setLearning, index, 'type_of_ld')}
                />
                <Input
                  label="Conducted/Sponsored By"
                  placeholder="Enter conducted/sponsored by"
                  {...bindRow(learning, setLearning, index, 'conducted_by')}
                />
              </div>
            </EntryCard>
          ))}
        </div>
        <Button
          variant="outline"
          color="primary"
          type="button"
          className="mt-4"
          onClick={() => addRow(setLearning, EMPTY_LEARNING)}
          leftIcon={<PlusIcon className="h-4 w-4" />}
        >
          Add Activity
        </Button>
      </SectionCard>
      <SaveBar section="learning" label="Save Learning & Development" />
    </TabPanel>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'personal':
        return renderPersonalInfo();
      case 'family':
        return renderFamilyBackground();
      case 'children':
        return renderChildren();
      case 'education':
        return renderEducation();
      case 'civil':
        return renderCivilService();
      case 'work':
        return renderWorkExperience();
      case 'learning':
        return renderLearningDevelopment();
      default:
        return renderPersonalInfo();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ---- Hero header ------------------------------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="relative overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm"
        >
          {/* Gradient cover with decorative blobs */}
          <div className="relative h-36 bg-gradient-to-r from-primary-700 via-primary-600 to-indigo-400 sm:h-44">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-indigo-300/20 blur-2xl" />
              <div className="absolute right-1/4 top-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
            </div>
          </div>

          <div className="px-6 pb-6 sm:px-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              {/* Avatar + identity */}
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-end">
                <div className="relative -mt-16 sm:-mt-20">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-3xl bg-gradient-to-br from-primary-500 to-indigo-500 text-4xl font-bold text-white shadow-xl ring-4 ring-white transition focus:outline-none focus:ring-primary-300"
                    aria-label={photoPreview ? 'Change photo' : 'Upload photo'}
                  >
                    {photoPreview ? (
                      <img src={photoPreview} alt={fullName} className="h-full w-full object-cover" />
                    ) : (
                      <span>{initials}</span>
                    )}

                    {/* Hover overlay */}
                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100">
                      {isUploadingPhoto ? (
                        <span className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <>
                          <CameraIcon className="h-6 w-6" />
                          <span className="text-xs font-medium">
                            {photoPreview ? 'Change' : 'Upload'}
                          </span>
                        </>
                      )}
                    </span>
                  </button>

                  {/* Floating action button */}
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-gray-600 shadow-md ring-1 ring-gray-200 transition hover:bg-gray-50 hover:text-primary-600"
                    aria-label="Change photo"
                  >
                    <CameraIcon className="h-5 w-5" />
                  </button>
                </div>

                <div className="pb-1 text-center sm:pb-0 sm:text-left">
                  <div className="flex items-center justify-center gap-2 sm:justify-start">
                    <h1 className="text-2xl font-bold text-gray-900">{fullName}</h1>
                    <CheckBadgeIcon className="h-6 w-6 text-primary-500" title="Verified account" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <span className="inline-flex items-center rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700 ring-1 ring-inset ring-primary-100">
                      {roleTitle}
                    </span>
                    {email && (
                      <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                        <EnvelopeIcon className="h-4 w-4" />
                        {email}
                      </span>
                    )}
                  </div>

                  {/* Photo controls */}
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700"
                    >
                      <ArrowUpTrayIcon className="h-4 w-4" />
                      {photoPreview ? 'Change photo' : 'Upload photo'}
                    </button>
                    {photoPreview && (
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-gray-500 transition hover:bg-red-50 hover:text-red-600"
                      >
                        <TrashIcon className="h-4 w-4" />
                        Remove
                      </button>
                    )}
                    <span className="text-xs text-gray-400">JPG or PNG, up to 5 MB</span>
                  </div>
                  {photoError && <p className="mt-1.5 text-xs text-red-600">{photoError}</p>}
                </div>
              </div>

              {/* Completion ring */}
              <div className="flex items-center justify-center gap-4 sm:justify-end">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">Profile setup</p>
                  <p className="text-xs text-gray-500">{completedTabs.length} of {tabs.length} sections filled in</p>
                </div>
                <div className="relative h-16 w-16">
                  <svg className="h-16 w-16 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9155" fill="none" className="stroke-gray-200" strokeWidth="3" />
                    <motion.circle
                      cx="18"
                      cy="18"
                      r="15.9155"
                      fill="none"
                      className="stroke-primary-600"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="100"
                      animate={{ strokeDashoffset: 100 - completion }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900">
                    {completion}%
                  </span>
                </div>
              </div>
            </div>

            {/* Meta chips */}
            <div className="mt-5 flex flex-wrap gap-2 border-t border-gray-100 pt-5">
              {institutionName && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                  <BuildingLibraryIcon className="h-4 w-4 text-gray-400" />
                  {institutionName}
                </span>
              )}
              {currentAcademicYear && (
                <span className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                  <CalendarDaysIcon className="h-4 w-4 text-gray-400" />
                  A.Y. {currentAcademicYear}
                </span>
              )}
              <span className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm text-gray-700 ring-1 ring-inset ring-gray-200">
                <IdentificationIcon className="h-4 w-4 text-gray-400" />
                Personal Data Sheet (CS Form 212)
              </span>
            </div>
          </div>
        </motion.div>

        {/* ---- Body: nav + content ---------------------------------------- */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          {/* Section navigation */}
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <nav
              className="flex gap-2 overflow-x-auto rounded-2xl border border-gray-200 bg-white p-2 shadow-sm lg:flex-col lg:overflow-visible"
              aria-label="Profile sections"
            >
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const isDone = hasContent(tab.id);
                const isUnsaved = isDirty(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`group relative flex min-w-[180px] items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors lg:min-w-0 ${
                      isActive ? 'text-primary-700' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="activeSection"
                        className="absolute inset-0 rounded-xl bg-primary-50 ring-1 ring-inset ring-primary-100"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span
                      className={`relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="relative min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{tab.name}</span>
                      <span className="block truncate text-xs text-gray-400">{tab.description}</span>
                    </span>
                    {isUnsaved ? (
                      <span
                        className="relative h-2 w-2 flex-shrink-0 rounded-full bg-amber-500"
                        title="Unsaved changes"
                      />
                    ) : (
                      isDone &&
                      !isActive && <CheckCircleIcon className="relative h-4 w-4 flex-shrink-0 text-primary-400" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Progress bar */}
            <div className="mt-4 hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:block">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
                <span>Sections filled in</span>
                <span>{completion}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-indigo-500"
                  animate={{ width: `${completion}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0">
            {/* Step indicator */}
            <div className="mb-4 flex items-center gap-2 text-sm text-gray-500">
              <span className="font-semibold text-gray-900">Step {activeIndex + 1}</span>
              <span>of {tabs.length}</span>
              <span className="mx-1 text-gray-300">·</span>
              <span>{tabs[activeIndex]?.name}</span>
            </div>

            {profile.isLoading ? (
              <div className="flex items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white py-16 text-sm text-gray-500 shadow-sm">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
                Loading your profile…
              </div>
            ) : profile.loadError ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
                <p className="font-semibold">We could not load your profile.</p>
                <Button
                  variant="outline"
                  color="danger"
                  type="button"
                  className="mt-3"
                  onClick={() => profile.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <AnimatePresence mode="wait">{renderTabContent()}</AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
