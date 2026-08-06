import { post } from './http'
import type { LoginRequest, LoginResponse } from './types'

export async function loginApi(payload: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', payload)
}