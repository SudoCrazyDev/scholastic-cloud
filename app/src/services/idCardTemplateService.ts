import { api } from '@/lib/api';

export type IdCardTemplateRecord = {
	id: number | string;
	title: string;
	design_json: any;
	institution_id: string;
	created_at: string;
	updated_at: string;
	created_by?: string;
	updated_by?: string;
};

export type IdCardTemplatePayload = {
	title: string;
	design_json: any;
	institution_id?: string;
};

export type IdCardTemplateUpdatePayload = Partial<{
	title: string;
	design_json: any;
	institution_id?: string;
}>;

export type IdCardTemplateListParams = {
	page?: number;
	institution_id?: string;
	search?: string;
	per_page?: number;
};

export type IdCardTemplateListResponse = {
	data: IdCardTemplateRecord[];
	meta: {
		current_page: number;
		last_page: number;
		per_page: number;
		total: number;
	};
};

export async function listIdCardTemplates(params?: IdCardTemplateListParams): Promise<IdCardTemplateListResponse> {
	const { data } = await api.get('/id-card-templates', { params });
	return data as IdCardTemplateListResponse;
}

export async function getIdCardTemplate(id: number | string): Promise<IdCardTemplateRecord> {
	const { data } = await api.get(`/id-card-templates/${id}`);
	return data as IdCardTemplateRecord;
}

export async function createIdCardTemplate(payload: IdCardTemplatePayload): Promise<IdCardTemplateRecord> {
	const { data } = await api.post('/id-card-templates', payload);
	return data as IdCardTemplateRecord;
}

export async function updateIdCardTemplate(id: number | string, payload: IdCardTemplateUpdatePayload): Promise<IdCardTemplateRecord> {
	const { data } = await api.put(`/id-card-templates/${id}`, payload);
	return data as IdCardTemplateRecord;
}

export async function deleteIdCardTemplate(id: number | string): Promise<void> {
	await api.delete(`/id-card-templates/${id}`);
}

export async function duplicateIdCardTemplate(id: number | string, newTitle?: string): Promise<IdCardTemplateRecord> {
	const original = await getIdCardTemplate(id);
	const title = newTitle || `${original.title} (Copy)`;

	return createIdCardTemplate({
		title,
		design_json: original.design_json,
		institution_id: original.institution_id,
	});
}

/**
 * Upload a design asset (template background, logo, custom image) to Cloudflare R2.
 * Returns the public URL to embed in the design JSON.
 */
export async function uploadIdCardAsset(file: File): Promise<{ url: string; path: string }> {
	const formData = new FormData();
	formData.append('file', file, file.name);
	const { data } = await api.post('/id-card-templates/assets', formData);
	return data as { url: string; path: string };
}
