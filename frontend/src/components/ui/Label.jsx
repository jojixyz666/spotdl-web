import { cn } from '../../lib/utils'

function Label({ className, ...props }) {
  return (
    <label
      className={cn('text-sm font-heading font-semibold text-nb-foreground leading-none', className)}
      {...props}
    />
  )
}

export { Label }
