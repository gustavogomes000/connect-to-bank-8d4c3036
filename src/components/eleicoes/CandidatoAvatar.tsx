import { getAvatarColor, getInitial } from '@/lib/eleicoes';
import { useState } from 'react';

interface CandidatoAvatarProps {
  nome: string;
  fotoUrl?: string | null;
  size?: number;
  className?: string;
}

export function CandidatoAvatar({ nome, fotoUrl, size = 40, className = '' }: CandidatoAvatarProps) {
  const [error, setError] = useState(false);

  if (fotoUrl && !error) {
    return (
      <img
        src={fotoUrl}
        alt={nome}
        className={`rounded-full object-cover ${className}`}
        style={{ width: size, height: size }}
        onError={() => setError(true)}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold ${className}`}
      style={{ width: size, height: size, backgroundColor: getAvatarColor(nome), fontSize: size * 0.4 }}
    >
      {getInitial(nome)}
    </div>
  );
}
