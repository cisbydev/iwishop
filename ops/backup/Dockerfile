# Image de la tâche planifiée Render « sauvegarde quotidienne ».
# postgres:18 : pg_dump de la même version majeure que la base de prod.
FROM postgres:18

RUN apt-get update \
    && apt-get install -y --no-install-recommends age rclone curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY sauvegarde_quotidienne.sh /usr/local/bin/sauvegarde_quotidienne.sh
RUN chmod 755 /usr/local/bin/sauvegarde_quotidienne.sh

# L'image démarre un serveur PostgreSQL par défaut : rien de tel ici.
ENTRYPOINT []
USER postgres
CMD ["/usr/local/bin/sauvegarde_quotidienne.sh"]
