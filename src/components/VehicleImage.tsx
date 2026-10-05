import React, { useState } from 'react';
import { Car } from 'lucide-react';

interface VehicleImageProps {
  src: string;
  alt: string;
  className?: string;
}

export const VehicleImage: React.FC<VehicleImageProps> = ({ src, alt, className = '' }) => {
  const [hasError, setHasError] = useState(false);

  if (hasError || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-slate-300 p-6 ${className}`}
      >
        <Car className="w-10 h-10 text-amber-500/80 mb-2 stroke-[1.5]" />
        <span className="text-xs font-medium text-slate-300 text-center line-clamp-1 max-w-[240px]">
          {alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setHasError(true)}
      className={className}
    />
  );
};
