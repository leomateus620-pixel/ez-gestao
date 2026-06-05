import ezLogo from '@/assets/ez-logo.png.asset.json';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  className?: string;
  alt?: string;
}

export function BrandLogo({ className, alt = 'EZ Gestão' }: BrandLogoProps) {
  return (
    <img
      src={ezLogo.url}
      alt={alt}
      className={cn('object-contain', className)}
      draggable={false}
    />
  );
}

export default BrandLogo;