import { api } from '@/lib/api';

export type CertificateRecord = {
	id: number | string;
	title: string;
	design_json: any;
	institution_id: string;
	created_at: string;
	updated_at: string;
	created_by?: string;
	updated_by?: string;
};

export type CertificatePayload = {
	title: string;
	design_json: any;
	institution_id?: string;
};

export type CertificateUpdatePayload = Partial<{
	title: string;
	design_json: any;
	institution_id?: string;
}>;

export type CertificateListParams = {
	page?: number;
	institution_id?: string;
	search?: string;
	per_page?: number;
};

export type CertificateListResponse = {
	data: CertificateRecord[];
	meta: {
		current_page: number;
		last_page: number;
		per_page: number;
		total: number;
	};
};

export async function listCertificates(params?: CertificateListParams): Promise<CertificateListResponse> {
	const { data } = await api.get('/certificates', { params });
	return data as CertificateListResponse;
}

export async function getCertificate(id: number | string): Promise<CertificateRecord> {
	const { data } = await api.get(`/certificates/${id}`);
	return data as CertificateRecord;
}

export async function createCertificate(payload: CertificatePayload): Promise<CertificateRecord> {
	const { data } = await api.post('/certificates', payload);
	return data as CertificateRecord;
}

export async function updateCertificate(id: number | string, payload: CertificateUpdatePayload): Promise<CertificateRecord> {
	const { data } = await api.put(`/certificates/${id}`, payload);
	return data as CertificateRecord;
}

export async function deleteCertificate(id: number): Promise<void> {
	await api.delete(`/certificates/${id}`);
}

export async function duplicateCertificate(id: number, newTitle?: string): Promise<CertificateRecord> {
	const original = await getCertificate(id);
	const title = newTitle || `${original.title} (Copy)`;
	
	return createCertificate({
		title,
		design_json: original.design_json,
		institution_id: original.institution_id,
	});
}