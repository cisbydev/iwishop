import api from './api';

export async function listerMesBoutiques() {
  const response = await api.get('tenants/mes-boutiques/');
  return response.data.results;
}
