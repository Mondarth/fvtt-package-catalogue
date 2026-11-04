# Sphinx toolchain for building the catalogue documentation.
# All Python tooling lives in this image; nothing is installed on the host.
FROM python:3.15-slim@sha256:94d3426f1def7db4a106a232ac121bfd975393e5dfd40a619b955fae45fe7913

RUN apt-get update \
    && apt-get install --yes --no-install-recommends make \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir --root-user-action=ignore -r /tmp/requirements.txt

# The container runs as the calling user (see compose.yaml), who has no home directory.
ENV HOME=/tmp \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /docs

CMD ["make", "html"]
