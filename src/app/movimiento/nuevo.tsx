import { useLocalSearchParams } from 'expo-router';

import { FormularioMovimiento } from '../../components/FormularioMovimiento';
import type { TipoMovimiento } from '../../db/movimientos';

const TIPOS: TipoMovimiento[] = ['GASTO', 'INGRESO', 'TRANSFERENCIA'];

export default function NuevoMovimiento() {
  const { tipo, billetera, monto, categoria, nota } = useLocalSearchParams<{
    tipo?: string;
    billetera?: string;
    monto?: string;
    categoria?: string;
    nota?: string;
  }>();
  const tipoInicial = TIPOS.find((t) => t === tipo);
  return (
    <FormularioMovimiento
      tipoInicial={tipoInicial}
      billeteraInicial={billetera ? Number(billetera) : undefined}
      montoInicial={monto ? Number(monto) : undefined}
      categoriaInicial={categoria ? Number(categoria) : undefined}
      notaInicial={nota}
    />
  );
}
