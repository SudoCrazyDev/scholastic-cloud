import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
	listIdCardTemplates,
	getIdCardTemplate,
	createIdCardTemplate,
	updateIdCardTemplate,
	deleteIdCardTemplate,
	duplicateIdCardTemplate,
	type IdCardTemplateUpdatePayload,
	type IdCardTemplateListParams,
} from '@/services/idCardTemplateService';

// Query keys
export const idCardTemplateKeys = {
	all: ['id-card-templates'] as const,
	lists: () => [...idCardTemplateKeys.all, 'list'] as const,
	list: (params?: IdCardTemplateListParams) => [...idCardTemplateKeys.lists(), params] as const,
	details: () => [...idCardTemplateKeys.all, 'detail'] as const,
	detail: (id: number | string) => [...idCardTemplateKeys.details(), id] as const,
};

// List templates
export function useIdCardTemplates(params?: IdCardTemplateListParams) {
	return useQuery({
		queryKey: idCardTemplateKeys.list(params),
		queryFn: () => listIdCardTemplates(params),
		staleTime: 5 * 60 * 1000,
	});
}

// Get single template (id is UUID string or number)
export function useIdCardTemplate(id: number | string | null) {
	return useQuery({
		queryKey: idCardTemplateKeys.detail(id!),
		queryFn: () => getIdCardTemplate(id!),
		enabled: !!id,
		staleTime: 5 * 60 * 1000,
	});
}

// Create template
export function useCreateIdCardTemplate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: createIdCardTemplate,
		onSuccess: (data) => {
			toast.success('ID card template created successfully!');
			queryClient.invalidateQueries({ queryKey: idCardTemplateKeys.lists() });
			queryClient.setQueryData(idCardTemplateKeys.detail(data.id), data);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to create ID card template';
			toast.error(message);
		},
	});
}

// Update template
export function useUpdateIdCardTemplate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, payload }: { id: number | string; payload: IdCardTemplateUpdatePayload }) =>
			updateIdCardTemplate(id, payload),
		onSuccess: (data) => {
			toast.success('ID card template updated successfully!');
			queryClient.invalidateQueries({ queryKey: idCardTemplateKeys.lists() });
			queryClient.setQueryData(idCardTemplateKeys.detail(data.id), data);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to update ID card template';
			toast.error(message);
		},
	});
}

// Delete template
export function useDeleteIdCardTemplate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: deleteIdCardTemplate,
		onSuccess: (_, id) => {
			toast.success('ID card template deleted successfully!');
			queryClient.invalidateQueries({ queryKey: idCardTemplateKeys.lists() });
			queryClient.removeQueries({ queryKey: idCardTemplateKeys.detail(id) });
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to delete ID card template';
			toast.error(message);
		},
	});
}

// Duplicate template
export function useDuplicateIdCardTemplate() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ id, newTitle }: { id: number | string; newTitle?: string }) =>
			duplicateIdCardTemplate(id, newTitle),
		onSuccess: (data) => {
			toast.success('ID card template duplicated successfully!');
			queryClient.invalidateQueries({ queryKey: idCardTemplateKeys.lists() });
			queryClient.setQueryData(idCardTemplateKeys.detail(data.id), data);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to duplicate ID card template';
			toast.error(message);
		},
	});
}
