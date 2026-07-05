import { cn } from '../../lib/utils'

function Select({ className, ...props }) {
  return (
    <select
      className={cn(
        'w-full h-10 bg-nb-secondary rounded-nb px-3 py-2 text-sm font-sans text-nb-foreground focus:outline-none focus:ring-2 focus:ring-nb-main focus:ring-offset-2 focus:ring-offset-nb-bg transition-all disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      style={{ borderWidth: '3px', borderStyle: 'solid', borderColor: '#000000' }}
      {...props}
    />
  )
}

export { Select }
