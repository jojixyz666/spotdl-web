import { cva } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-heading font-bold text-sm rounded-nb px-4 py-2 shadow-nb transition-all duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nb-main focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        default: 'bg-nb-main text-nb-main-foreground hover:translate-x-nb-sm hover:translate-y-nb-sm hover:shadow-nb-hover active:translate-x-nb active:translate-y-nb active:shadow-none',
        neutral: 'bg-nb-secondary text-nb-foreground hover:translate-x-nb-sm hover:translate-y-nb-sm hover:shadow-nb-hover active:translate-x-nb active:translate-y-nb active:shadow-none',
        danger: 'bg-nb-danger text-nb-danger-foreground hover:translate-x-nb-sm hover:translate-y-nb-sm hover:shadow-nb-hover active:translate-x-nb active:translate-y-nb active:shadow-none',
        ghost: 'border-transparent bg-transparent text-nb-foreground shadow-none hover:bg-nb-secondary hover:shadow-nb-sm hover:border-nb-border',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 py-1.5 text-xs',
        lg: 'h-12 px-6 py-3 text-base',
        icon: 'h-10 w-10 p-0',
        'icon-sm': 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({ className, variant, size, ...props }) {
  const isGhost = variant === 'ghost'
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      style={isGhost ? undefined : { borderWidth: '3px', borderStyle: 'solid', borderColor: '#000000' }}
      {...props}
    />
  )
}

export { Button, buttonVariants }
