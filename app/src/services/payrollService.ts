import { api } from '../lib/api'
import type {
  ApiResponse,
  CreatePayrollPeriodData,
  Payslip,
  PayslipSummary,
  PayrollCompensation,
  PayrollDeductionType,
  PayrollPeriod,
  PayrollStaffCompensation,
  PayslipTemplate,
  SavePayrollCompensationData,
  SavePayrollDeductionTypeData,
  SavePayslipTemplateData,
  UpdatePayslipData,
  UpdatePayslipDayData,
} from '../types'

class PayrollService {
  // --- Deduction types (institution catalog) ---

  async getDeductionTypes() {
    const response = await api.get<ApiResponse<PayrollDeductionType[]>>('/payroll-deduction-types')
    return response.data
  }

  async createDeductionType(payload: SavePayrollDeductionTypeData) {
    const response = await api.post<ApiResponse<PayrollDeductionType>>(
      '/payroll-deduction-types',
      payload
    )
    return response.data
  }

  async updateDeductionType(id: string, payload: SavePayrollDeductionTypeData) {
    const response = await api.put<ApiResponse<PayrollDeductionType>>(
      `/payroll-deduction-types/${id}`,
      payload
    )
    return response.data
  }

  async deleteDeductionType(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/payroll-deduction-types/${id}`)
    return response.data
  }

  // --- Payslip templates (designer) ---

  async getPayslipTemplates() {
    const response = await api.get<ApiResponse<PayslipTemplate[]>>('/payslip-templates')
    return response.data
  }

  async createPayslipTemplate(payload: SavePayslipTemplateData) {
    const response = await api.post<ApiResponse<PayslipTemplate>>('/payslip-templates', payload)
    return response.data
  }

  async updatePayslipTemplate(id: string, payload: SavePayslipTemplateData) {
    const response = await api.put<ApiResponse<PayslipTemplate>>(`/payslip-templates/${id}`, payload)
    return response.data
  }

  async deletePayslipTemplate(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/payslip-templates/${id}`)
    return response.data
  }

  // --- Compensation settings (Employee Rates) ---

  async getCompensations(params?: { search?: string }) {
    const query = new URLSearchParams()
    if (params?.search) {
      query.append('search', params.search)
    }
    const url = `/payroll-compensations${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<ApiResponse<PayrollStaffCompensation[]>>(url)
    return response.data
  }

  async saveCompensation(userId: string, payload: SavePayrollCompensationData) {
    const response = await api.put<ApiResponse<PayrollCompensation>>(
      `/payroll-compensations/${userId}`,
      payload
    )
    return response.data
  }

  // --- Payroll periods ---

  async getPeriods() {
    const response = await api.get<ApiResponse<PayrollPeriod[]>>('/payroll-periods')
    return response.data
  }

  async createPeriod(payload: CreatePayrollPeriodData) {
    const response = await api.post<ApiResponse<PayrollPeriod>>('/payroll-periods', payload)
    return response.data
  }

  async updatePeriod(id: string, payload: CreatePayrollPeriodData) {
    const response = await api.put<ApiResponse<PayrollPeriod>>(`/payroll-periods/${id}`, payload)
    return response.data
  }

  async deletePeriod(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/payroll-periods/${id}`)
    return response.data
  }

  async generatePayslips(id: string) {
    const response = await api.post<ApiResponse<PayrollPeriod>>(`/payroll-periods/${id}/generate`)
    return response.data
  }

  async finalizePeriod(id: string, paidOn?: string) {
    const response = await api.post<ApiResponse<PayrollPeriod>>(
      `/payroll-periods/${id}/finalize`,
      paidOn ? { paid_on: paidOn } : {}
    )
    return response.data
  }

  async reopenPeriod(id: string) {
    const response = await api.post<ApiResponse<PayrollPeriod>>(`/payroll-periods/${id}/reopen`)
    return response.data
  }

  // --- Payslips ---

  async getPayslips(periodId: string) {
    const response = await api.get<ApiResponse<PayslipSummary[]>>(
      `/payroll-periods/${periodId}/payslips`
    )
    return response.data
  }

  async getPayslip(id: string) {
    const response = await api.get<ApiResponse<Payslip>>(`/payslips/${id}`)
    return response.data
  }

  async updatePayslip(id: string, payload: UpdatePayslipData) {
    const response = await api.put<ApiResponse<Payslip>>(`/payslips/${id}`, payload)
    return response.data
  }

  async updatePayslipDay(payslipId: string, dayId: string, payload: UpdatePayslipDayData) {
    const response = await api.put<ApiResponse<Payslip>>(
      `/payslips/${payslipId}/days/${dayId}`,
      payload
    )
    return response.data
  }
}

export const payrollService = new PayrollService()
