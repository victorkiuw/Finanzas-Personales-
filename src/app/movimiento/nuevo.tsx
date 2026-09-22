import { useLocalSearchParams } from 'expo-router';

import { FormularioMovimiento } from '../../components/FormularioMovimiento';
import type { TipoMovimiento } from '../../db/movimientos';

const TIPOS: TipoMovimiento[] = ['GASTO', 'INGRESO', 'TRANSFERENCIA'];

export default function NuevoMovimiento() {
  const { tipo, billetera } = useLocalSearchParams<{ tipo?: string; billetera?: string }>();
  const tipoInicial = TIPOS.find((t) => t === tipo);
  return (
    <FormularioMovimiento
      tipoInicial={tipoInicial}
      billeteraInicial={billetera ? Number(billetera) : undefined}
    />
  );
}
