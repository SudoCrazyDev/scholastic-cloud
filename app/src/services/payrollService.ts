import { api } from '../lib/api'
import type {
  ApiResponse,
  CreatePayrollPeriodData,
  Payslip,
  PayrollCompensation,
  PayrollDeductionType,
  PayrollPeriod,
  PayrollPeriodReport,
  PayrollPeriodSaveResponse,
  PayrollSettings,
  PayrollSheet,
  PayrollStaffCompensation,
  PayslipListResponse,
  PayslipTemplate,
  SavePayrollCompensationData,
  SavePayrollDeductionTypeData,
  SavePayslipTemplateData,
  SaveStaffLoanData,
  StaffLoan,
  StaffLoanBorrower,
  StaffLoanListResponse,
  StaffLoanQuote,
  StaffLoanTerms,
  UpdatePayslipData,
  UpdatePayslipDayData,
} from '../types'

class PayrollService {
  // --- Settings (late/undertime penalty rates) ---

  async getSettings() {
    const response = await api.get<ApiResponse<PayrollSettings>>('/payroll-settings')
    return response.data
  }

  async saveSettings(payload: PayrollSettings) {
    const response = await api.put<ApiResponse<PayrollSettings>>('/payroll-settings', payload)
    return response.data
  }

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
    const response = await api.post<PayrollPeriodSaveResponse>('/payroll-periods', payload)
    return response.data
  }

  async updatePeriod(id: string, payload: CreatePayrollPeriodData) {
    const response = await api.put<PayrollPeriodSaveResponse>(`/payroll-periods/${id}`, payload)
    return response.data
  }

  async deletePeriod(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/payroll-periods/${id}`)
    return response.data
  }

  async generatePayslips(id: string) {
    const response = await api.post<PayrollPeriodSaveResponse>(
      `/payroll-periods/${id}/generate`
    )
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
    const response = await api.get<PayslipListResponse>(`/payroll-periods/${periodId}/payslips`)
    return response.data
  }

  // The whole period on one printable sheet (monthly summary).
  async getPeriodSheet(periodId: string) {
    const response = await api.get<ApiResponse<PayrollSheet>>(
      `/payroll-periods/${periodId}/sheet`
    )
    return response.data
  }

  // What the period cost, totalled — payout, both sides of every deduction.
  async getPeriodReport(periodId: string) {
    const response = await api.get<ApiResponse<PayrollPeriodReport>>(
      `/payroll-periods/${periodId}/report`
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

  // --- Staff loans ---

  async getStaffLoans(params?: { status?: string; search?: string; user_id?: string }) {
    const query = new URLSearchParams()
    if (params?.status) query.append('status', params.status)
    if (params?.search) query.append('search', params.search)
    if (params?.user_id) query.append('user_id', params.user_id)
    const url = `/staff-loans${query.toString() ? `?${query.toString()}` : ''}`
    const response = await api.get<StaffLoanListResponse>(url)
    return response.data
  }

  // Staff payroll already knows a rate for — the only ones a loan can be
  // collected off.
  async getStaffLoanBorrowers() {
    const response = await api.get<ApiResponse<StaffLoanBorrower[]>>('/staff-loans/borrowers')
    return response.data
  }

  // Price a set of terms without saving. The form previews the same arithmetic
  // locally as it is typed; this is the authoritative answer.
  async quoteStaffLoan(payload: StaffLoanTerms) {
    const response = await api.post<ApiResponse<StaffLoanQuote>>('/staff-loans/quote', payload)
    return response.data
  }

  async getStaffLoan(id: string) {
    const response = await api.get<ApiResponse<StaffLoan>>(`/staff-loans/${id}`)
    return response.data
  }

  async createStaffLoan(payload: SaveStaffLoanData) {
    const response = await api.post<ApiResponse<StaffLoan>>('/staff-loans', payload)
    return response.data
  }

  async updateStaffLoan(id: string, payload: SaveStaffLoanData) {
    const response = await api.put<ApiResponse<StaffLoan>>(`/staff-loans/${id}`, payload)
    return response.data
  }

  async deleteStaffLoan(id: string) {
    const response = await api.delete<ApiResponse<null>>(`/staff-loans/${id}`)
    return response.data
  }

  async approveStaffLoan(id: string, reviewNote?: string) {
    const response = await api.post<ApiResponse<StaffLoan>>(`/staff-loans/${id}/approve`, {
      review_note: reviewNote || null,
    })
    return response.data
  }

  async rejectStaffLoan(id: string, reviewNote: string) {
    const response = await api.post<ApiResponse<StaffLoan>>(`/staff-loans/${id}/reject`, {
      review_note: reviewNote,
    })
    return response.data
  }

  // Stops an approved loan. What has already come off payslips stays off.
  async cancelStaffLoan(id: string, reviewNote: string) {
    const response = await api.post<ApiResponse<StaffLoan>>(`/staff-loans/${id}/cancel`, {
      review_note: reviewNote,
    })
    return response.data
  }
}

export const payrollService = new PayrollService()
