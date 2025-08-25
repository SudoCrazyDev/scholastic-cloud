import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
	FileText, 
	Edit3, 
	Download, 
	Share2, 
	Settings,
	Plus,
	ArrowRight
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Card, { CardBody } from '@/components/ui/Card';

const CertificateBuilderDemo: React.FC = () => {
	const features = [
		{
			icon: <FileText className="w-6 h-6" />,
			title: 'Rich Text Elements',
			description: 'Add and customize text with various fonts, sizes, colors, and alignments'
		},
		{
			icon: <Edit3 className="w-6 h-6" />,
			title: 'Visual Design Tools',
			description: 'Create shapes, add images, and design beautiful layouts with ease'
		},
		{
			icon: <Download className="w-6 h-6" />,
			title: 'PDF Export',
			description: 'Export your certificates as high-quality PDFs for printing and sharing'
		},
		{
			icon: <Share2 className="w-6 h-6" />,
			title: 'Save & Load',
			description: 'Save your work and load existing certificates for editing'
		},
		{
			icon: <Settings className="w-6 h-6" />,
			title: 'Advanced Controls',
			description: 'Fine-tune positioning, rotation, opacity, and layering'
		},
		{
			icon: <Plus className="w-6 h-6" />,
			title: 'Drag & Drop',
			description: 'Intuitive drag and drop interface for easy element manipulation'
		}
	];

	return (
		<motion.div
			initial={{ opacity: 0 }}
			animate={{ opacity: 1 }}
			className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50"
		>
			{/* Header */}
			<div className="bg-white shadow-sm border-b">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<div className="flex justify-between items-center py-6">
						<div>
							<h1 className="text-3xl font-bold text-gray-900">Certificate Builder</h1>
							<p className="text-gray-600 mt-1">Create professional certificates with ease</p>
						</div>
						<Link to="/certificate-builder">
							<Button size="lg" icon={<Plus className="w-5 h-5" />}>
								Start Building
							</Button>
						</Link>
					</div>
				</div>
			</div>

			{/* Hero Section */}
			<div className="py-20">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
					<motion.h2
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.1 }}
						className="text-5xl font-bold text-gray-900 mb-6"
					>
						Design Beautiful Certificates
					</motion.h2>
					<motion.p
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.2 }}
						className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto"
					>
						Create professional-looking certificates, awards, and diplomas with our intuitive drag-and-drop editor. 
						No design experience required.
					</motion.p>
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.3 }}
						className="flex gap-4 justify-center"
					>
						<Link to="/certificate-builder">
							<Button size="lg" variant="primary" icon={<ArrowRight className="w-5 h-5" />}>
								Get Started
							</Button>
						</Link>
						<Button size="lg" variant="secondary">
							View Examples
						</Button>
					</motion.div>
				</div>
			</div>

			{/* Features Grid */}
			<div className="py-20 bg-white">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.4 }}
						className="text-center mb-16"
					>
						<h3 className="text-3xl font-bold text-gray-900 mb-4">Powerful Features</h3>
						<p className="text-xl text-gray-600">Everything you need to create stunning certificates</p>
					</motion.div>
					
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
						{features.map((feature, index) => (
							<motion.div
								key={index}
								initial={{ opacity: 0, y: 20 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ delay: 0.1 * (index + 1) }}
							>
								<Card hoverable className="h-full">
									<CardBody className="text-center">
										<div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 text-blue-600">
											{feature.icon}
										</div>
										<h4 className="text-xl font-semibold text-gray-900 mb-2">
											{feature.title}
										</h4>
										<p className="text-gray-600">
											{feature.description}
										</p>
									</CardBody>
								</Card>
							</motion.div>
						))}
					</div>
				</div>
			</div>

			{/* CTA Section */}
			<div className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
				<div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
					<motion.h3
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.5 }}
						className="text-3xl font-bold text-white mb-4"
					>
						Ready to Create Your First Certificate?
					</motion.h3>
					<motion.p
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.6 }}
						className="text-xl text-blue-100 mb-8"
					>
						Join thousands of users who are already creating professional certificates
					</motion.p>
					<motion.div
						initial={{ opacity: 0, y: 20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.7 }}
					>
						<Link to="/certificate-builder">
							<Button size="lg" variant="primary" className="bg-white text-blue-600 hover:bg-gray-100">
								Start Building Now
							</Button>
						</Link>
					</motion.div>
				</div>
			</div>

			{/* Footer */}
			<div className="bg-gray-900 text-white py-12">
				<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
					<p className="text-gray-400">
						© 2024 Certificate Builder. Built with React, TypeScript, and Framer Motion.
					</p>
				</div>
			</div>
		</motion.div>
	);
};

export default CertificateBuilderDemo;
