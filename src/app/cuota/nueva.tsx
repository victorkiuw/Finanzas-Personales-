import { useLocalSearchParams } from 'expo-router';

import { FormularioCompraCuotas } from '../../components/FormularioCompraCuotas';

export default function NuevaCompraCuotas() {
  const p = useLocalSearchParams<{ total?: string; categoria?: string; descripcion?: string; billetera?: string }>();
  const numero = (v?: string) => (v && Number(v) > 0 ? Number(v) : undefined);
  return (
    <FormularioCompraCuotas
      totalInicial={numero(p.total)}
      categoriaInicial={numero(p.categoria)}
      descripcionInicial={p.descripcion || undefined}
      billeteraInicial={numero(p.billetera)}
    />
  );
}
