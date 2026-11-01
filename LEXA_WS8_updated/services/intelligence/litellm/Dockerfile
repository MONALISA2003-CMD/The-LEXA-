FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN pip install --no-cache-dir "litellm[proxy]==1.106.6" PyYAML
COPY services/intelligence/litellm/config.yaml /app/config.yaml
COPY services/intelligence/litellm/entrypoint.py /app/entrypoint.py
EXPOSE 4000
CMD ["python", "/app/entrypoint.py"]
