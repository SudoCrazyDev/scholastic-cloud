import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listIdCardTemplates, duplicateIdCardTemplate, deleteIdCardTemplate, type IdCardTemplateRecord } from '@/services/idCardTemplateService';
import Button from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'react-hot-toast';
import {
	PlusIcon,
	IdentificationIcon,
	CalendarIcon,
	ArrowTopRightOnSquareIcon,
	ClockIcon,
	BuildingOfficeIcon,
	DocumentDuplicateIcon,
	TrashIcon,
} from '@heroicons/react/24/outline';

export default function IdCardList() {
	const [items, setItems] = useState<IdCardTemplateRecord[]>([]);
	const [loading, setLoading] = useState(false);
	const [busyId, setBusyId] = useState<number | string | null>(null);
	const navigate = useNavigate();
	const { user } = useAuth();

	const defaultUi = user?.user_institutions?.find((ui: any) => ui.is_default);
	const mainUi = user?.user_institutions?.find((ui: any) => ui.is_main);
	const currentInstitution = defaultUi?.institution || mainUi?.institution;
	const institutionId = defaultUi?.institution_id || mainUi?.institution_id || currentInstitution?.id;

	const load = useCallback(async () => {
		if (!institutionId) {
			setItems([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		try {
			const resp = await listIdCardTemplates({ institution_id: institutionId });
			const data = Array.isArray(resp) ? resp : (resp as { data?: IdCardTemplateRecord[] }).data ?? [];
			setItems(data);
		} finally {
			setLoading(false);
		}
	}, [institutionId]);

	useEffect(() => { load(); }, [load]);

	const handleDuplicate = async (item: IdCardTemplateRecord) => {
		try {
			setBusyId(item.id);
			await duplicateIdCardTemplate(item.id);
			toast.success('Template duplicated!');
			await load();
		} catch {
			toast.error('Failed to duplicate template');
		} finally {
			setBusyId(null);
		}
	};

	const handleDelete = async (item: IdCardTemplateRecord) => {
		if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
		try {
			setBusyId(item.id);
			await deleteIdCardTemplate(item.id);
			toast.success('Template deleted');
			await load();
		} catch {
			toast.error('Failed to delete template');
		} finally {
			setBusyId(null);
		}
	};

	const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08, delayChildren: 0.1 } } };
	const itemVariants = { hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35 } } };

	const NoInstitutionState = () => (
		<motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16">
			<div className="w-24 h-24 bg-gradient-to-br from-red-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6">
				<BuildingOfficeIcon className="w-12 h-12 text-red-600" />
			</div>
			<h3 className="text-xl font-semibold text-gray-900 mb-2">No Institution Access</h3>
			<p className="text-gray-600 mb-8 max-w-md mx-auto">You don't have access to any institution. Please contact your administrator.</p>
		</motion.div>
	);

	const EmptyState = () => (
		<motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-16">
			<div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
				<IdentificationIcon className="w-12 h-12 text-indigo-600" />
			</div>
			<h3 className="text-xl font-semibold text-gray-900 mb-2">No ID templates yet</h3>
			<p className="text-gray-600 mb-8 max-w-md mx-auto">Design your first student ID card (front & back) for {currentInstitution?.name ?? currentInstitution?.title ?? 'your institution'}.</p>
			<Button variant="primary" onClick={() => navigate('/id-card-builder/new')} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg">
				<PlusIcon className="w-5 h-5 mr-2" />
				Create New ID Template
			</Button>
		</motion.div>
	);

	if (!currentInstitution) {
		return (
			<motion.div variants={containerVariants} initial="hidden" animate="visible" className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
				<div><NoInstitutionState /></div>
			</motion.div>
		);
	}

	return (
		<motion.div variants={containerVariants} initial="hidden" animate="visible" className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
			<div>
				<div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
					<div>
						<h1 className="text-3xl font-bold text-gray-900 mb-2">Student ID Builder</h1>
						<p className="text-gray-600 text-lg">Design and print student ID cards for {currentInstitution?.name ?? currentInstitution?.title ?? 'your institution'}</p>
					</div>
					<Button variant="primary" onClick={() => navigate('/id-card-builder/new')} className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg px-6 py-3">
						<PlusIcon className="w-5 h-5 mr-2" />
						Create New ID Template
					</Button>
				</div>

				{loading ? (
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						{Array.from({ length: 6 }).map((_, i) => (
							<div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse h-44" />
						))}
					</div>
				) : items.length === 0 ? (
					<EmptyState />
				) : (
					<motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
						<AnimatePresence>
							{items.map((item) => (
								<motion.div key={item.id} variants={itemVariants} layout className="group bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg hover:border-indigo-200 transition-all duration-300 transform hover:-translate-y-1">
									<div className="flex items-start space-x-4 mb-4">
										<div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl flex items-center justify-center">
											<IdentificationIcon className="w-6 h-6 text-indigo-600" />
										</div>
										<div className="flex-1 min-w-0">
											<h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors truncate">{item.title}</h3>
											<p className="text-sm text-gray-500 mt-1">ID: {String(item.id).slice(0, 8)}...</p>
										</div>
									</div>

									<div className="space-y-2 mb-6">
										<div className="flex items-center space-x-2 text-sm text-gray-600">
											<CalendarIcon className="w-4 h-4 text-gray-400" />
											<span>Updated: {new Date(item.updated_at).toLocaleDateString()}</span>
										</div>
										<div className="flex items-center space-x-2 text-sm text-gray-600">
											<ClockIcon className="w-4 h-4 text-gray-400" />
											<span>{new Date(item.updated_at).toLocaleTimeString()}</span>
										</div>
									</div>

									<div className="flex gap-2">
										<Button variant="secondary" onClick={() => navigate(`/id-card-builder?id=${item.id}`)} className="flex-1 bg-gray-50 hover:bg-indigo-50 border-gray-200 hover:border-indigo-200 text-gray-700 hover:text-indigo-700">
											<ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
											Open
										</Button>
										<Button variant="secondary" onClick={() => handleDuplicate(item)} disabled={busyId === item.id} className="bg-gray-50 hover:bg-purple-50 border-gray-200 text-gray-700 hover:text-purple-700" title="Duplicate">
											<DocumentDuplicateIcon className={`w-4 h-4 ${busyId === item.id ? 'animate-spin' : ''}`} />
										</Button>
										<Button variant="secondary" onClick={() => handleDelete(item)} disabled={busyId === item.id} className="bg-gray-50 hover:bg-red-50 border-gray-200 text-gray-700 hover:text-red-700" title="Delete">
											<TrashIcon className="w-4 h-4" />
										</Button>
									</div>
								</motion.div>
							))}
						</AnimatePresence>
					</motion.div>
				)}
			</div>
		</motion.div>
	);
}
