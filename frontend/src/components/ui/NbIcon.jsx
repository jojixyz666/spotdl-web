import { cn } from '../../lib/utils'

const VARIANTS = {
  default: 'bg-nb-main/20 text-nb-main',
  danger: 'bg-nb-danger/20 text-nb-danger',
  warning: 'bg-nb-warning/20 text-nb-warning',
  info: 'bg-nb-info/20 text-nb-info',
  muted: 'bg-nb-secondary text-nb-muted',
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
        'rounded-nb border-2 border-nb-border shadow-nb-sm flex items-center justify-center flex-shrink-0',
        SIZES[size],
        VARIANTS[variant],
        className
      )}
      {...props}
    >
      <Icon size={iconSize || (size === 'lg' ? 48 : size === 'md' ? 32 : 18)} />
    </div>
  )
}

export { NbIcon }
