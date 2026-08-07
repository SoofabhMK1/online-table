import { useState } from 'react'
import { App, Form, Input, Modal } from 'antd'
import { changeAccountApi } from '../api/auth'

interface AccountFormValues {
  username: string
  oldPassword: string
  newPassword?: string
  confirmPassword?: string
}

interface AccountSettingsModalProps {
  open: boolean
  onClose: () => void
  currentUsername: string
  onUsernameChanged: (username: string) => void
}

export default function AccountSettingsModal({
  open,
  onClose,
  currentUsername,
  onUsernameChanged,
}: AccountSettingsModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<AccountFormValues>()
  const [submitting, setSubmitting] = useState(false)

  const handleCancel = () => {
    form.resetFields()
    onClose()
  }

  const handleOk = async () => {
    const values = await form.validateFields()
    const usernameChanged = values.username.trim() !== currentUsername
    const passwordChanged = !!values.newPassword
    if (!usernameChanged && !passwordChanged) {
      message.warning('没有需要修改的内容')
      return
    }
    setSubmitting(true)
    try {
      await changeAccountApi({
        old_password: values.oldPassword,
        new_username: values.username.trim(),
        new_password: values.newPassword || undefined,
      })
      message.success('账号设置已保存')
      if (usernameChanged) {
        onUsernameChanged(values.username.trim())
      }
      handleCancel()
    } catch (error) {
      const detail = (
        error as { response?: { data?: { detail?: string } } }
      )?.response?.data?.detail
      message.error(detail ?? '保存失败，请重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      title="账号设置"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{ username: currentUsername }}
      >
        <Form.Item
          name="username"
          label="登录用户名"
          tooltip="修改后需使用新用户名登录；请确认不与他人重复。"
          rules={[
            { required: true, message: '请输入登录用户名' },
            { max: 50, message: '用户名最长 50 个字符' },
          ]}
        >
          <Input placeholder="登录用户名" />
        </Form.Item>
        <Form.Item
          name="oldPassword"
          label="原密码"
          tooltip="修改用户名或密码均需输入原密码确认身份。"
          rules={[{ required: true, message: '请输入原密码' }]}
        >
          <Input.Password placeholder="请输入当前使用的密码" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label="新密码"
          tooltip="留空表示不修改密码。"
          rules={[
            { min: 6, message: '新密码长度至少 6 位' },
          ]}
        >
          <Input.Password placeholder="留空则不修改，长度至少 6 位" />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label="确认新密码"
          dependencies={['newPassword']}
          rules={[
            ({ getFieldValue }) => ({
              validator(_, value) {
                const np = getFieldValue('newPassword')
                if (!np) return Promise.resolve()
                if (!value) return Promise.reject(new Error('请再次输入新密码'))
                if (np === value) return Promise.resolve()
                return Promise.reject(new Error('两次输入的新密码不一致'))
              },
            }),
          ]}
        >
          <Input.Password placeholder="再次输入新密码" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
