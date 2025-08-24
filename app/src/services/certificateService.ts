import { api } from '@/lib/api';

export type CertificateRecord = {
	id: number;
	title: string;
	design_json: any;
	created_at: string;
	updated_at: string;
};

export async function listCertificates(params?: { page?: number }) {
	const { data } = await api.get('/certificates', { params });
	return data as { data: CertificateRecord[]; meta?: any } | CertificateRecord[];
}

export async function getCertificate(id: number) {
	const { data } = await api.get(`/certificates/${id}`);
	return data as CertificateRecord;
}

export async function createCertificate(payload: { title: string; design_json: any }) {
	const { data } = await api.post('/certificates', payload);
	return data as CertificateRecord;
}

export async function updateCertificate(id: number, payload: Partial<{ title: string; design_json: any }>) {
	const { data } = await api.put(`/certificates/${id}`, payload);
	return data as CertificateRecord;
}