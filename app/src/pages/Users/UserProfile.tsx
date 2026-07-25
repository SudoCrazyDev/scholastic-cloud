import { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from '../../components/input';
import { Button } from '../../components/button';
import { Textarea } from '../../components/textarea';
import { useAuth } from '../../hooks/useAuth';
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
} from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

const tabs = [
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

function SaveBar({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-5">
      <Button variant="ghost" color="secondary">
        Cancel
      </Button>
      <Button color="primary" leftIcon={<CheckCircleIcon className="h-5 w-5" />}>
        {label}
      </Button>
    </div>
  );
}

export default function UserProfile() {
  const { user, currentAcademicYear } = useAuth();
  const [activeTab, setActiveTab] = useState('personal');
  const [visited, setVisited] = useState<Set<string>>(() => new Set(['personal']));

  const selectTab = (id: string) => {
    setActiveTab(id);
    setVisited((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

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

  const completion = Math.round((visited.size / tabs.length) * 100);
  const activeIndex = tabs.findIndex((t) => t.id === activeTab);

  // ---- Tab content ----------------------------------------------------------
  const renderPersonalInfo = () => (
    <TabPanel id="personal">
      <SectionCard title="Personal Information" subtitle="Government IDs and contact details" icon={UserIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Place of Birth" placeholder="Enter place of birth" />
          <Input label="Civil Status" placeholder="Enter civil status" />
          <Input label="Height" placeholder="Enter height (cm)" />
          <Input label="Weight" placeholder="Enter weight (kg)" />
          <Input label="Blood Type" placeholder="Enter blood type" />
          <Input label="GSIS ID" placeholder="Enter GSIS ID" />
          <Input label="PAG-IBIG ID" placeholder="Enter PAG-IBIG ID" />
          <Input label="PhilHealth ID" placeholder="Enter PhilHealth ID" />
          <Input label="SSS" placeholder="Enter SSS number" />
          <Input label="TIN" placeholder="Enter TIN" />
          <Input label="Agency Employee ID" placeholder="Enter agency employee ID" />
          <Input label="Telephone No." placeholder="Enter telephone number" />
          <Input label="Mobile No." placeholder="Enter mobile number" />
        </div>
        <div className="mt-6">
          <SaveBar label="Save Personal Info" />
        </div>
      </SectionCard>
    </TabPanel>
  );

  const renderFamilyBackground = () => (
    <TabPanel id="family">
      <SectionCard title="Spouse" subtitle="Details of your spouse" icon={UsersIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="First Name" placeholder="Enter spouse's first name" />
          <Input label="Middle Name" placeholder="Enter spouse's middle name" />
          <Input label="Last Name" placeholder="Enter spouse's last name" />
          <Input label="Extension Name" placeholder="Enter spouse's extension name" />
          <Input label="Occupation" placeholder="Enter spouse's occupation" />
          <Input label="Employer/Business Name" placeholder="Enter spouse's employer/business name" />
          <Input label="Business Address" placeholder="Enter spouse's business address" />
          <Input label="Telephone No." placeholder="Enter spouse's telephone number" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Father" subtitle="Father's name" icon={UserIcon}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="First Name" placeholder="Enter father's first name" />
            <Input label="Middle Name" placeholder="Enter father's middle name" />
            <Input label="Last Name" placeholder="Enter father's last name" />
            <Input label="Extension Name" placeholder="Enter father's extension name" />
          </div>
        </SectionCard>

        <SectionCard title="Mother" subtitle="Mother's maiden name" icon={UserIcon}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="First Name" placeholder="Enter mother's first name" />
            <Input label="Middle Name" placeholder="Enter mother's middle name" />
            <Input label="Last Name" placeholder="Enter mother's last name" />
            <Input label="Extension Name" placeholder="Enter mother's extension name" />
          </div>
        </SectionCard>
      </div>

      <SaveBar label="Save Family Background" />
    </TabPanel>
  );

  const renderChildren = () => (
    <TabPanel id="children">
      <SectionCard title="Children" subtitle="List your dependents in chronological order" icon={UserGroupIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Child Name" placeholder="Enter child's name" />
          <Input label="Birthday" placeholder="MM/DD/YYYY" type="date" />
        </div>
        <Button variant="outline" color="primary" className="mt-4" leftIcon={<PlusIcon className="h-4 w-4" />}>
          Add Child
        </Button>
      </SectionCard>
      <SaveBar label="Save Children" />
    </TabPanel>
  );

  const renderEducation = () => (
    <TabPanel id="education">
      <SectionCard title="Educational Background" subtitle="From elementary to graduate studies" icon={AcademicCapIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="School Name" placeholder="Enter school name" />
          <Input label="Degree" placeholder="Enter degree" />
          <Input label="Year Graduated" placeholder="YYYY" type="number" />
          <Input label="Honors/Awards" placeholder="Enter honors/awards" />
        </div>
        <Button variant="outline" color="primary" className="mt-4" leftIcon={<PlusIcon className="h-4 w-4" />}>
          Add Education
        </Button>
      </SectionCard>
      <SaveBar label="Save Educational Background" />
    </TabPanel>
  );

  const renderCivilService = () => (
    <TabPanel id="civil">
      <SectionCard title="Civil Service Eligibility" subtitle="Career service & other eligibilities" icon={IdentificationIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Eligibility Type" placeholder="Enter eligibility type" />
          <Input label="Rating" placeholder="Enter rating" />
          <Input label="Date of Exam" placeholder="MM/DD/YYYY" type="date" />
          <Input label="Place of Exam" placeholder="Enter place of exam" />
        </div>
        <Button variant="outline" color="primary" className="mt-4" leftIcon={<PlusIcon className="h-4 w-4" />}>
          Add Eligibility
        </Button>
      </SectionCard>
      <SaveBar label="Save Civil Service Eligibility" />
    </TabPanel>
  );

  const renderWorkExperience = () => (
    <TabPanel id="work">
      <SectionCard title="Work Experience" subtitle="Start with your most recent position" icon={BriefcaseIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input label="Company Name" placeholder="Enter company name" />
          <Input label="Position" placeholder="Enter position" />
          <Input label="Start Date" placeholder="MM/DD/YYYY" type="date" />
          <Input label="End Date" placeholder="MM/DD/YYYY" type="date" />
          <div className="md:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700">Duties/Responsibilities</label>
            <Textarea placeholder="Describe duties and responsibilities" />
          </div>
        </div>
        <Button variant="outline" color="primary" className="mt-4" leftIcon={<PlusIcon className="h-4 w-4" />}>
          Add Work Experience
        </Button>
      </SectionCard>
      <SaveBar label="Save Work Experience" />
    </TabPanel>
  );

  const renderLearningDevelopment = () => (
    <TabPanel id="learning">
      <SectionCard title="Learning & Development" subtitle="Trainings, seminars and interventions" icon={HeartIcon}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Input
              label="Title of Learning and Development Interventions/Training Programs"
              placeholder="Enter title"
            />
          </div>
          <Input label="Inclusive Dates of Attendance From" placeholder="MM/DD/YYYY" type="date" />
          <Input label="Inclusive Dates of Attendance To" placeholder="MM/DD/YYYY" type="date" />
          <Input label="Number of Hours" placeholder="Enter number of hours" type="number" />
          <Input label="Type of L.D" placeholder="Enter type of L.D" />
          <Input label="Conducted/Sponsored By" placeholder="Enter conducted/sponsored by" />
        </div>
        <Button variant="outline" color="primary" className="mt-4" leftIcon={<PlusIcon className="h-4 w-4" />}>
          Add Activity
        </Button>
      </SectionCard>
      <SaveBar label="Save Learning & Development" />
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
                  <p className="text-xs text-gray-500">{visited.size} of {tabs.length} sections reviewed</p>
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
                const isDone = visited.has(tab.id);
                return (
                  <button
                    key={tab.id}
                    onClick={() => selectTab(tab.id)}
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
                    {isDone && !isActive && (
                      <CheckCircleIcon className="relative h-4 w-4 flex-shrink-0 text-primary-400" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Progress bar */}
            <div className="mt-4 hidden rounded-2xl border border-gray-200 bg-white p-4 shadow-sm lg:block">
              <div className="mb-2 flex items-center justify-between text-xs font-medium text-gray-500">
                <span>Sections reviewed</span>
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
            <AnimatePresence mode="wait">{renderTabContent()}</AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
