import { api } from '../lib/api';

const API_URL = '/core-value-markings';

export const coreValueMarkingService = {
  get: (params?: any) =>
    api.get(API_URL, { params })
      .then(res => Array.isArray(res.data.data) ? res.data.data : [])
      .catch(() => []),
  create: (data: any) => api.post(API_URL, data).then(res => res.data.data),
  update: (id: string, data: any) => api.put(`${API_URL}/${id}`, data).then(res => res.data.data),
  delete: (id: string) => api.delete(`${API_URL}/${id}`).then(res => res.data.data),
}; 