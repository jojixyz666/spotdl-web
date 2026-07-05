import { cn } from '../../lib/utils'

function Card({ className, ...props }) {
  return (
    <div
      className={cn('bg-nb-surface border-2 border-nb-border rounded-nb shadow-nb flex flex-col gap-6 py-6', className)}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }) {
  return (
    <div
      className={cn('px-6 flex flex-col gap-1.5', className)}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }) {
  return (
    <div
      className={cn('font-heading font-bold text-lg text-nb-foreground', className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }) {
  return (
    <div
      className={cn('text-sm text-nb-muted', className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }) {
  return (
    <div
      className={cn('px-6', className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }) {
  return (
    <div
      className={cn('flex items-center px-6', className)}
      {...props}
    />
  )
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
