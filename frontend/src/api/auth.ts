import { post } from './http'
import type {
  ChangeAccountRequest,
  ChangePasswordRequest,
  LoginRequest,
  LoginResponse,
} from './types'

export async function loginApi(payload: LoginRequest): Promise<LoginResponse> {
  return post<LoginResponse>('/auth/login', payload)
}

export async function changePasswordApi(
  oldPassword: string,
  newPassword: string,
): Promise<{ message: string }> {
  return post<{ message: string }>('/auth/change-password', {
    old_password: oldPassword,
    new_password: newPassword,
  } satisfies ChangePasswordRequest)
}

export async function changeAccountApi(
  payload: ChangeAccountRequest,
): Promise<{ username: string; message: string }> {
  return post<{ username: string; message: string }>('/auth/change-account', payload)
}