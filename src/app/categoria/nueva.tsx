import { useLocalSearchParams } from 'expo-router';

import { FormularioCategoria } from '../../components/FormularioCategoria';

export default function NuevaCategoria() {
  const { tipo } = useLocalSearchParams<{ tipo?: string }>();
  return <FormularioCategoria tipoInicial={tipo === 'INGRESO' ? 'INGRESO' : 'GASTO'} />;
}
