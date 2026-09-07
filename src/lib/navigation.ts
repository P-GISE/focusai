export type Screen =
  | 'login'
  | 'camera'
  | 'dashboard'
  | 'announcements'
  | 'support'
  | 'session-setup'
  | 'learning'
  | 'result'
  | 'report'
  | 'feedback'
  | 'admin'
  | 'settings'

export type NavItem = {
  id: Screen
  label: string
  icon: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'admin', label: '관리자', icon: '🛡️' },
  { id: 'dashboard', label: '대시보드', icon: '📊' },
  { id: 'announcements', label: '공지사항', icon: '📢' },
  { id: 'session-setup', label: '세션 시작', icon: '▶️' },
  { id: 'report', label: '리포트', icon: '📈' },
  { id: 'feedback', label: 'AI 피드백', icon: '🤖' },
  { id: 'support', label: '문의/신고', icon: '💬' },
  { id: 'settings', label: '설정', icon: '⚙️' },
]
