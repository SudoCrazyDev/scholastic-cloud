import { useEffect, useState } from 'react';
import { listCertificates, type CertificateRecord } from '@/services/certificateService';
import Button from '@/components/ui/Button';
import { useNavigate } from 'react-router-dom';

export default function CertificateList() {
	const [items, setItems] = useState<CertificateRecord[]>([]);
	const [loading, setLoading] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		async function load() {
			setLoading(true);
			try {
				const resp = await listCertificates();
				const data = Array.isArray(resp) ? resp : resp.data;
				setItems(data);
			} finally {
				setLoading(false);
			}
		}
		load();
	}, []);

	return (
		<div className="p-4">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-lg font-semibold">Certificates</h1>
				<Button variant="secondary" onClick={() => navigate('/certificate-builder')}>New</Button>
			</div>
			{loading ? (
				<div>Loading...</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{items.map(item => (
						<div key={item.id} className="border rounded p-3 bg-white">
							<div className="text-sm text-gray-500">ID: {item.id}</div>
							<div className="font-medium">{item.title}</div>
							<div className="text-xs text-gray-400">Updated: {new Date(item.updated_at).toLocaleString()}</div>
							<div className="mt-3 flex gap-2">
								<Button variant="secondary" onClick={() => navigate(`/certificate-builder?id=${item.id}`)}>Open</Button>
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}