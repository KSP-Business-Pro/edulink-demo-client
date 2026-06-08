// ─────────────────────────────────────────────────────────────────────────────
//  CreditsBadge.tsx — Indicateur crédits CECT avec contrôle CAMES
// ─────────────────────────────────────────────────────────────────────────────
import type { CreditCheck } from '../../../services/referentiel.service';
import { CREDITS_PAR_SEMESTRE } from '../../../types/referentiel.types';

interface Props {
  check: CreditCheck;
  label?: string;
  showDetail?: boolean;
}

export default function CreditsBadge({ check, label, showDetail = false }: Props) {
  const { totalCredits, valid, delta } = check;

  const color  = valid ? '#059669' : delta > 0 ? '#dc2626' : '#d97706';
  const bg     = valid ? '#dcfce7' : delta > 0 ? '#fee2e2' : '#fef9c3';
  const icon   = valid ? '✓' : delta > 0 ? '↑' : '↓';
  const status = valid ? 'OK' : delta > 0 ? `+${delta} excess` : `${delta} manquant`;

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span
        className="badge"
        style={{ background: bg, color, fontSize: 11, padding: '3px 10px' }}
        title={`${totalCredits} / ${CREDITS_PAR_SEMESTRE} CECT par semestre CAMES`}
      >
        {icon} {totalCredits} CECT {label ? `— ${label}` : ''}
      </span>
      {showDetail && !valid && (
        <span style={{ fontSize: 11, color }}>({status})</span>
      )}
    </div>
  );
}
