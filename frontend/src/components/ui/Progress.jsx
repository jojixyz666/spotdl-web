import { cn } from '../../lib/utils'

function Progress({ className, value, ...props }) {
  return (
    <div
      className={cn(
        'relative h-4 w-full overflow-hidden rounded-nb border-2 border-nb-border bg-nb-secondary',
        className
      )}
      {...props}
    >
      <div
        className="h-full bg-nb-main border-r-2 border-nb-border transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  )
}

export { Progress }
