FROM node:20

ARG USERNAME=node
RUN apt-get update \
  && apt-get install -y sudo groff less rsync zip \
  && echo $USERNAME ALL=\(root\) NOPASSWD:ALL > /etc/sudoers.d/$USERNAME \
  && chmod 0440 /etc/sudoers.d/$USERNAME

RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
RUN unzip awscliv2.zip
RUN sudo ./aws/install
RUN npm -g install typescript @ionic/cli@7 @angular/cli@16

WORKDIR /workspace
RUN  chown 1000:1000 /workspace
USER node
WORKDIR /workspace
EXPOSE 8100