import api from './api';

export async function listerNotifications() {
  const response = await api.get('notifications/');
  return response.data.results;
}

export async function compterNonLues() {
  const response = await api.get('notifications/non_lues_count/');
  return response.data.count;
}

export async function marquerLue(id) {
  const response = await api.post(`notifications/${id}/marquer_lue/`);
  return response.data;
}
