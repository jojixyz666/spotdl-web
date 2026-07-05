import { cn } from '../../lib/utils'

function Progress({ className, value, ...props }) {
  return (
    <div
      className={cn(
        'relative h-4 w-full overflow-hidden rounded-nb bg-nb-secondary',
        className
      )}
      style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: '#000000' }}
      {...props}
    >
      <div
        className="h-full bg-nb-main transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)`, borderRight: '3px solid #000000' }}
      />
    </div>
  )
}

export { Progress }
