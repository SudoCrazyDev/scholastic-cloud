import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
	listCertificates,
	getCertificate,
	createCertificate,
	updateCertificate,
	deleteCertificate,
	duplicateCertificate,
	type CertificatePayload,
	type CertificateUpdatePayload,
	type CertificateListParams,
} from '@/services/certificateService';

// Query keys
export const certificateKeys = {
	all: ['certificates'] as const,
	lists: () => [...certificateKeys.all, 'list'] as const,
	list: (params?: CertificateListParams) => [...certificateKeys.lists(), params] as const,
	details: () => [...certificateKeys.all, 'detail'] as const,
	detail: (id: number) => [...certificateKeys.details(), id] as const,
};

// List certificates
export function useCertificates(params?: CertificateListParams) {
	return useQuery({
		queryKey: certificateKeys.list(params),
		queryFn: () => listCertificates(params),
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Get single certificate
export function useCertificate(id: number | null) {
	return useQuery({
		queryKey: certificateKeys.detail(id!),
		queryFn: () => getCertificate(id!),
		enabled: !!id,
		staleTime: 5 * 60 * 1000, // 5 minutes
	});
}

// Create certificate
export function useCreateCertificate() {
	const queryClient = useQueryClient();
	
	return useMutation({
		mutationFn: createCertificate,
		onSuccess: (data) => {
			toast.success('Certificate created successfully!');
			queryClient.invalidateQueries({ queryKey: certificateKeys.lists() });
			queryClient.setQueryData(certificateKeys.detail(data.id), data);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to create certificate';
			toast.error(message);
		},
	});
}

// Update certificate
export function useUpdateCertificate() {
	const queryClient = useQueryClient();
	
	return useMutation({
		mutationFn: ({ id, payload }: { id: number; payload: CertificateUpdatePayload }) =>
			updateCertificate(id, payload),
		onSuccess: (data) => {
			toast.success('Certificate updated successfully!');
			queryClient.invalidateQueries({ queryKey: certificateKeys.lists() });
			queryClient.setQueryData(certificateKeys.detail(data.id), data);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to update certificate';
			toast.error(message);
		},
	});
}

// Delete certificate
export function useDeleteCertificate() {
	const queryClient = useQueryClient();
	
	return useMutation({
		mutationFn: deleteCertificate,
		onSuccess: (_, id) => {
			toast.success('Certificate deleted successfully!');
			queryClient.invalidateQueries({ queryKey: certificateKeys.lists() });
			queryClient.removeQueries({ queryKey: certificateKeys.detail(id) });
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to delete certificate';
			toast.error(message);
		},
	});
}

// Duplicate certificate
export function useDuplicateCertificate() {
	const queryClient = useQueryClient();
	
	return useMutation({
		mutationFn: ({ id, newTitle }: { id: number; newTitle?: string }) =>
			duplicateCertificate(id, newTitle),
		onSuccess: (data) => {
			toast.success('Certificate duplicated successfully!');
			queryClient.invalidateQueries({ queryKey: certificateKeys.lists() });
			queryClient.setQueryData(certificateKeys.detail(data.id), data);
		},
		onError: (error: any) => {
			const message = error?.response?.data?.message || 'Failed to duplicate certificate';
			toast.error(message);
		},
	});
}
