import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { listCertificates, type CertificateRecord } from '@/services/certificateService';
import Button from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { 
  PlusIcon, 
  DocumentTextIcon, 
  CalendarIcon, 
  ArrowTopRightOnSquareIcon,
  ClockIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';

export default function CertificateList() {
	const [items, setItems] = useState<CertificateRecord[]>([]);
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();
	const { user } = useAuth();

	// Get user's default institution
	const defaultInstitution = user?.user_institutions?.find((ui: any) => ui.is_default)?.institution;
	const mainInstitution = user?.user_institutions?.find((ui: any) => ui.is_main)?.institution;
	const currentInstitution = defaultInstitution || mainInstitution;

	useEffect(() => {
		async function load() {
			if (!currentInstitution) {
				setItems([]);
				setLoading(false);
				return;
			}

			setLoading(true);
			try {
				const resp = await listCertificates({ institution_id: currentInstitution.id });
				const data = Array.isArray(resp) ? resp : resp.data;
				setItems(data);
			} finally {
				setLoading(false);
			}
		}
		load();
	}, [currentInstitution]);

	// Animation variants
	const containerVariants = {
		hidden: { opacity: 0 },
		visible: {
			opacity: 1,
			transition: {
				staggerChildren: 0.1,
				delayChildren: 0.2,
			},
		},
	};

	const itemVariants = {
		hidden: { opacity: 0, y: 20, scale: 0.95 },
		visible: {
			opacity: 1,
			y: 0,
			scale: 1,
			transition: {
				duration: 0.4,
				ease: [0.4, 0, 0.2, 1],
			},
		},
	};

	const headerVariants = {
		hidden: { opacity: 0, y: -20 },
		visible: {
			opacity: 1,
			y: 0,
			transition: {
				duration: 0.5,
				ease: [0.4, 0, 0.2, 1],
			},
		},
	};

	// Loading skeleton component
	const LoadingSkeleton = () => (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
		>
			{Array.from({ length: 6 }).map((_, index) => (
				<motion.div
					key={index}
					initial={{ opacity: 0, y: 20 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: index * 0.1 }}
					className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-pulse"
				>
					<div className="space-y-4">
						<div className="flex items-center space-x-3">
							<div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
							<div className="flex-1 space-y-2">
								<div className="h-4 bg-gray-200 rounded w-3/4"></div>
								<div className="h-3 bg-gray-200 rounded w-1/2"></div>
							</div>
						</div>
						<div className="space-y-2">
							<div className="h-4 bg-gray-200 rounded w-full"></div>
							<div className="h-3 bg-gray-200 rounded w-2/3"></div>
						</div>
						<div className="h-9 bg-gray-200 rounded-lg w-full"></div>
					</div>
				</motion.div>
			))}
		</motion.div>
	);

	// No institution state component
	const NoInstitutionState = () => (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.5 }}
			className="text-center py-16"
		>
			<div className="w-24 h-24 bg-gradient-to-br from-red-100 to-pink-100 rounded-full flex items-center justify-center mx-auto mb-6">
				<BuildingOfficeIcon className="w-12 h-12 text-red-600" />
			</div>
			<h3 className="text-xl font-semibold text-gray-900 mb-2">No Institution Access</h3>
			<p className="text-gray-600 mb-8 max-w-md mx-auto">
				You don't have access to any institution. Please contact your administrator to set up your institution access.
			</p>
		</motion.div>
	);

	// Empty state component
	const EmptyState = () => (
		<motion.div
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{ opacity: 1, scale: 1 }}
			transition={{ duration: 0.5 }}
			className="text-center py-16"
		>
			<div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
				<DocumentTextIcon className="w-12 h-12 text-indigo-600" />
			</div>
			<h3 className="text-xl font-semibold text-gray-900 mb-2">No certificates yet</h3>
			<p className="text-gray-600 mb-8 max-w-md mx-auto">
				Get started by creating your first certificate for {currentInstitution?.name || 'your institution'}.
			</p>
			<Button
				variant="primary"
				onClick={() => navigate('/certificate-builder')}
				className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
			>
				<PlusIcon className="w-5 h-5 mr-2" />
				Create Your First Certificate
			</Button>
		</motion.div>
	);

	// If no institution access, show no institution state
	if (!currentInstitution) {
		return (
			<motion.div
				variants={containerVariants}
				initial="hidden"
				animate="visible"
				className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6"
			>
				<div className="max-w-7xl mx-auto">
					<NoInstitutionState />
				</div>
			</motion.div>
		);
	}

	return (
		<motion.div
			variants={containerVariants}
			initial="hidden"
			animate="visible"
			className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6"
		>
			<div className="max-w-7xl mx-auto">
				{/* Header Section */}
				<motion.div
					variants={headerVariants}
					className="mb-8"
				>
					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div>
							<motion.h1 
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: 0.1, duration: 0.5 }}
								className="text-3xl font-bold text-gray-900 mb-2"
							>
								Certificates
							</motion.h1>
							<motion.p 
								initial={{ opacity: 0, x: -20 }}
								animate={{ opacity: 1, x: 0 }}
								transition={{ delay: 0.2, duration: 0.5 }}
								className="text-gray-600 text-lg"
							>
								Manage and create professional certificates for {currentInstitution.name}
							</motion.p>
						</div>
						<motion.div
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ delay: 0.3, duration: 0.5 }}
						>
							<Button
								variant="primary"
								onClick={() => navigate('/certificate-builder')}
								className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 px-6 py-3"
							>
								<PlusIcon className="w-5 h-5 mr-2" />
								New Certificate
							</Button>
						</motion.div>
					</div>
				</motion.div>

				{/* Content Section */}
				<motion.div
					variants={containerVariants}
					className="space-y-6"
				>
					{loading ? (
						<LoadingSkeleton />
					) : items.length === 0 ? (
						<EmptyState />
					) : (
						<motion.div
							variants={containerVariants}
							className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
						>
							<AnimatePresence>
								{items.map((item) => (
									<motion.div
										key={item.id}
										variants={itemVariants}
										layout
										className="group bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-lg hover:shadow-indigo-100/50 hover:border-indigo-200 transition-all duration-300 transform hover:-translate-y-1"
									>
										{/* Certificate Icon and Title */}
										<div className="flex items-start space-x-4 mb-4">
											<div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-xl flex items-center justify-center group-hover:from-indigo-200 group-hover:to-purple-200 transition-all duration-300">
												<DocumentTextIcon className="w-6 h-6 text-indigo-600" />
											</div>
											<div className="flex-1 min-w-0">
												<h3 className="text-lg font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors duration-200 truncate">
													{item.title}
												</h3>
												<p className="text-sm text-gray-500 mt-1">ID: {item.id}</p>
											</div>
										</div>

										{/* Certificate Details */}
										<div className="space-y-3 mb-6">
											<div className="flex items-center space-x-2 text-sm text-gray-600">
												<CalendarIcon className="w-4 h-4 text-gray-400" />
												<span>Updated: {new Date(item.updated_at).toLocaleDateString()}</span>
											</div>
											<div className="flex items-center space-x-2 text-sm text-gray-600">
												<ClockIcon className="w-4 h-4 text-gray-400" />
												<span>{new Date(item.updated_at).toLocaleTimeString()}</span>
											</div>
											{/* Institution Info */}
											<div className="flex items-center space-x-2 text-sm text-gray-600">
												<BuildingOfficeIcon className="w-4 h-4 text-gray-400" />
												<span>{currentInstitution.name}</span>
											</div>
										</div>

										{/* Action Button */}
										<Button
											variant="secondary"
											onClick={() => navigate(`/certificate-builder?id=${item.id}`)}
											className="w-full bg-gray-50 hover:bg-indigo-50 border-gray-200 hover:border-indigo-200 text-gray-700 hover:text-indigo-700 transition-all duration-200 group-hover:shadow-md"
										>
											<ArrowTopRightOnSquareIcon className="w-4 h-4 mr-2" />
											Open Certificate
										</Button>
									</motion.div>
								))}
							</AnimatePresence>
						</motion.div>
					)}
				</motion.div>
			</div>
		</motion.div>
	);
}