/**
 * Sistema de componentes (capa shadcn sobre Radix). Es lo que usan las pantallas nuevas:
 * `{ Button } from '@/componentes/ui'`. Las piezas heredadas (`boton-primario`,
 * `control-filtro`, `insignia`…) se van sustituyendo pantalla a pantalla.
 */
export { Alert, AlertDescription, AlertTitle, alertVariants } from './alert';
export { Badge, badgeVariants } from './badge';
export { Button, buttonVariants } from './button';
export { Checkbox } from './checkbox';
export { Dato } from './dato';
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';
export {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogOverlay,
  DialogPortal, DialogTitle, DialogTrigger,
} from './dialog';
export { EstadoCargando, EstadoError, EstadoVacio } from './estado';
export { Input } from './input';
export { Label } from './label';
export { Progress } from './progress';
export { Select } from './select';
export { Skeleton, SkeletonFilas } from './skeleton';
export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow } from './table';
export { TabsNav, type Pestana } from './tabs';
