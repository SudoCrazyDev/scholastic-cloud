import { useState } from 'react';
import { motion } from 'framer-motion';
import { Input } from '../../components/input';
import { Button } from '../../components/button';
import { Textarea } from '../../components/textarea';
import {
  UserIcon,
  UsersIcon,
  AcademicCapIcon,
  IdentificationIcon,
  BriefcaseIcon,
  HeartIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

const tabs = [
  { id: 'personal', name: 'Personal Info', icon: UserIcon },
  { id: 'family', name: 'Family Background', icon: UsersIcon },
  { id: 'children', name: 'Children', icon: UserGroupIcon },
  { id: 'education', name: 'Educational Background', icon: AcademicCapIcon },
  { id: 'civil', name: 'Civil Service Eligibility', icon: IdentificationIcon },
  { id: 'work', name: 'Work Experience', icon: BriefcaseIcon },
  { id: 'learning', name: 'Learning & Development', icon: HeartIcon }, // Added tab
];

export default function UserProfile() {
  const [activeTab, setActiveTab] = useState('personal');

  // Placeholder tab content renderers
  const renderPersonalInfo = () => (
    <motion.div
      key="personal"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      <div className="flex justify-end">
        <Button color="primary">Save Personal Info</Button>
      </div>
    </motion.div>
  );

  const renderFamilyBackground = () => (
    <motion.div
      key="family"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-8">
        {/* Spouse Section */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Spouse</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="First Name" placeholder="Enter spouse's first name" />
            <Input label="Middle Name" placeholder="Enter spouse's middle name" />
            <Input label="Last Name" placeholder="Enter spouse's last name" />
            <Input label="Extension Name" placeholder="Enter spouse's extension name" />
            <Input label="Occupation" placeholder="Enter spouse's occupation" />
            <Input label="Employer/Business Name" placeholder="Enter spouse's employer/business name" />
            <Input label="Business Address" placeholder="Enter spouse's business address" />
            <Input label="Telephone No." placeholder="Enter spouse's telephone number" />
          </div>
        </div>
        {/* Father Section */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Father</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="First Name" placeholder="Enter father's first name" />
            <Input label="Middle Name" placeholder="Enter father's middle name" />
            <Input label="Last Name" placeholder="Enter father's last name" />
            <Input label="Extension Name" placeholder="Enter father's extension name" />
          </div>
        </div>
        {/* Mother Section */}
        <div>
          <h3 className="text-lg font-semibold mb-2">Mother</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="First Name" placeholder="Enter mother's first name" />
            <Input label="Middle Name" placeholder="Enter mother's middle name" />
            <Input label="Last Name" placeholder="Enter mother's last name" />
            <Input label="Extension Name" placeholder="Enter mother's extension name" />
          </div>
        </div>
      </div>
      <div className="flex justify-end">
        <Button color="primary">Save Family Background</Button>
      </div>
    </motion.div>
  );

  const renderChildren = () => (
    <motion.div
      key="children"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Child Name" placeholder="Enter child's name" />
          <Input label="Birthday" placeholder="MM/DD/YYYY" type="date" />
        </div>
        <Button variant="outline" color="primary" className="mt-2">+ Add Child</Button>
      </div>
      <div className="flex justify-end">
        <Button color="primary">Save Children</Button>
      </div>
    </motion.div>
  );

  const renderEducation = () => (
    <motion.div
      key="education"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="School Name" placeholder="Enter school name" />
          <Input label="Degree" placeholder="Enter degree" />
          <Input label="Year Graduated" placeholder="YYYY" type="number" />
          <Input label="Honors/Awards" placeholder="Enter honors/awards" />
        </div>
        <Button variant="outline" color="primary" className="mt-2">+ Add Education</Button>
      </div>
      <div className="flex justify-end">
        <Button color="primary">Save Educational Background</Button>
      </div>
    </motion.div>
  );

  const renderCivilService = () => (
    <motion.div
      key="civil"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Eligibility Type" placeholder="Enter eligibility type" />
          <Input label="Rating" placeholder="Enter rating" />
          <Input label="Date of Exam" placeholder="MM/DD/YYYY" type="date" />
          <Input label="Place of Exam" placeholder="Enter place of exam" />
        </div>
        <Button variant="outline" color="primary" className="mt-2">+ Add Eligibility</Button>
      </div>
      <div className="flex justify-end">
        <Button color="primary">Save Civil Service Eligibility</Button>
      </div>
    </motion.div>
  );

  const renderWorkExperience = () => (
    <motion.div
      key="work"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Company Name" placeholder="Enter company name" />
          <Input label="Position" placeholder="Enter position" />
          <Input label="Start Date" placeholder="MM/DD/YYYY" type="date" />
          <Input label="End Date" placeholder="MM/DD/YYYY" type="date" />
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Duties/Responsibilities</label>
            <Textarea placeholder="Describe duties and responsibilities" />
          </div>
        </div>
        <Button variant="outline" color="primary" className="mt-2">+ Add Work Experience</Button>
      </div>
      <div className="flex justify-end">
        <Button color="primary">Save Work Experience</Button>
      </div>
    </motion.div>
  );

  const renderLearningDevelopment = () => (
    <motion.div
      key="learning"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Title of Learning and Development Interventions/Training Programs" placeholder="Enter title" />
          <Input label="Inclusive Dates of Attendance From" placeholder="MM/DD/YYYY" type="date" />
          <Input label="Inclusive Dates of Attendance To" placeholder="MM/DD/YYYY" type="date" />
          <Input label="Number of Hours" placeholder="Enter number of hours" type="number" />
          <Input label="Type of L.D" placeholder="Enter type of L.D" />
          <Input label="Conducted/Sponsored By" placeholder="Enter conducted/sponsored by" />
        </div>
        <Button variant="outline" color="primary" className="mt-2">+ Add Activity</Button>
      </div>
      <div className="flex justify-end">
        <Button color="primary">Save Learning & Development</Button>
      </div>
    </motion.div>
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
    <div className="max-w-full mx-auto py-10 px-2 animate-in fade-in duration-500">
      <motion.h1
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-3xl font-bold mb-8 text-center"
      >
        User Profile
      </motion.h1>
      <div className="bg-white rounded-xl shadow p-6">
        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="flex space-x-8 px-2" aria-label="Tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                    activeTab === tab.id
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.name}</span>
                </button>
              );
            })}
          </nav>
        </div>
        {/* Tab Content */}
        <div className="p-2">{renderTabContent()}</div>
      </div>
    </div>
  );
} 