import { useLocalSearchParams } from 'expo-router';

import { FormularioAjeno } from '../../components/FormularioAjeno';

export default function NuevoDineroAjeno() {
  const { billetera } = useLocalSearchParams<{ billetera?: string }>();
  return <FormularioAjeno billeteraInicial={billetera ? Number(billetera) : null} />;
}
