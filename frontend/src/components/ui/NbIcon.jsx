import { cn } from '../../lib/utils'

const VARIANTS = {
  default: 'bg-nb-main text-nb-foreground',
  danger: 'bg-nb-danger text-nb-foreground',
  warning: 'bg-nb-warning text-nb-foreground',
  info: 'bg-nb-info text-nb-info-foreground',
  muted: 'bg-nb-surface2 text-nb-foreground',
}

const SIZES = {
  sm: 'w-10 h-10',
  md: 'w-16 h-16',
  lg: 'w-24 h-24',
}

function NbIcon({ icon: Icon, size = 'sm', variant = 'default', className, iconSize, ...props }) {
  return (
    <div
      className={cn(
        'rounded-nb border-2 border-nb-border shadow-nb-sm flex items-center justify-center flex-shrink-0 font-bold',
        SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      <Icon size={iconSize || (size === 'lg' ? 48 : size === 'md' ? 32 : 18)} strokeWidth={2.5} />
    </div>
  )
}

export { NbIcon }
