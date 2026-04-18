import { RSLogo } from './RSLogo'

export function AppHeader() {
  return (
    <header
      className="flex items-center justify-between px-5 bg-rs-blue-fusion"
      style={{
        paddingTop: 'calc(16px + env(safe-area-inset-top))',
        paddingBottom: 16,
      }}
    >
      <div className="flex items-center gap-2">
        <RSLogo size={28} />
        <span className="text-[11px] font-semibold tracking-[1.5px] text-rs-cream uppercase">
          Rowly Studios
        </span>
      </div>
      <form action="/auth/signout" method="post">
        <button
          type="submit"
          className="text-[10px] uppercase tracking-wider text-rs-cream/60 hover:text-rs-cream"
        >
          Sign out
        </button>
      </form>
    </header>
  )
}
