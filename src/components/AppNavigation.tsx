import { NAV_ITEMS, type Screen } from '../lib/navigation'

type RuntimeStatusProps = {
  backendReady: boolean
  isLocalRuntime: boolean
  runtimeConnectionLabel: string
  runtimeDetail: string | null
  runtimeLabel: string | null
}

type NavigationUser = {
  isAdmin: boolean
  name: string
}

type TopNavigationProps = RuntimeStatusProps & {
  mobileSidebarOpen: boolean
  onLogout: () => void
  onNavigate: (screen: Screen) => void
  onToggleSidebar: () => void
  screen: Screen
  user: NavigationUser | null
}

type SidebarProps = {
  mobileSidebarOpen: boolean
  onNavigate: (screen: Screen) => void
  screen: Screen
  user: NavigationUser | null
}

export function RuntimeStatusStrip({
  backendReady,
  isLocalRuntime,
  runtimeConnectionLabel,
  runtimeLabel,
}: RuntimeStatusProps) {
  return (
    <div className="runtime-status-strip" aria-label="실행 환경">
      {isLocalRuntime && runtimeLabel && <span className="runtime-pill local">{runtimeLabel}</span>}
      <span className={`runtime-pill ${backendReady ? 'online' : 'offline'}`}>{runtimeConnectionLabel}</span>
    </div>
  )
}

export function AuthRuntimePanel({
  backendReady,
  isLocalRuntime,
  runtimeConnectionLabel,
  runtimeDetail,
  runtimeLabel,
}: RuntimeStatusProps) {
  return (
    <div className="auth-runtime-panel" aria-label="실행 환경">
      {isLocalRuntime && runtimeLabel && (
        <span className="runtime-status-line">
          <span className="runtime-pill local">{runtimeLabel}</span>
          {runtimeDetail && <span>{runtimeDetail}</span>}
        </span>
      )}
      <span className="runtime-status-line api-status">
        <span className={`runtime-pill ${backendReady ? 'online' : 'offline'}`}>{runtimeConnectionLabel}</span>
      </span>
    </div>
  )
}

export function TopNavigation({
  backendReady,
  isLocalRuntime,
  mobileSidebarOpen,
  onLogout,
  onNavigate,
  onToggleSidebar,
  runtimeConnectionLabel,
  runtimeDetail,
  runtimeLabel,
  screen,
  user,
}: TopNavigationProps) {
  if (!user) return null

  const isLearningScreen = screen === 'learning'

  return (
    <header className="top-nav">
      <div className="top-nav-start">
        {!isLearningScreen && (
          <button
            type="button"
            className="sidebar-toggle"
            aria-controls="main-sidebar"
            aria-expanded={mobileSidebarOpen}
            onClick={onToggleSidebar}
          >
            <span className="sidebar-toggle-icon" aria-hidden="true" />
            <span>메뉴</span>
          </button>
        )}
        <button type="button" className="brand" onClick={() => onNavigate('dashboard')}>
          <span className="brand-mark small" aria-hidden="true" />
          <span className="brand-word">
            Focus<span>AI</span>
          </span>
        </button>
      </div>
      <div className="top-nav-user">
        <RuntimeStatusStrip
          backendReady={backendReady}
          isLocalRuntime={isLocalRuntime}
          runtimeConnectionLabel={runtimeConnectionLabel}
          runtimeDetail={runtimeDetail}
          runtimeLabel={runtimeLabel}
        />
        <div className="user-chip">
          <span className="user-avatar">{user.name.slice(0, 1)}</span>
          <div>
            <strong>{user.name}</strong>
          </div>
        </div>
        {!isLearningScreen && (
          <button type="button" className="ghost-button" onClick={onLogout}>
            로그아웃
          </button>
        )}
      </div>
    </header>
  )
}

export function Sidebar({ mobileSidebarOpen, onNavigate, screen, user }: SidebarProps) {
  return (
    <aside id="main-sidebar" className={`sidebar${mobileSidebarOpen ? ' is-open' : ''}`}>
      {NAV_ITEMS.filter((item) => item.id !== 'admin' || user?.isAdmin).map((item) => (
        <button
          key={item.id}
          type="button"
          className={`sidebar-item${screen === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </aside>
  )
}
