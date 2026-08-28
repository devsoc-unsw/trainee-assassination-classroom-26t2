#! /bin/bash


cat *.txt | while read -r line; do
    grep -viEx "$line" decrypto.tmp
done | sort | uniq -c | grep 758 | sed -E "s/[0-9]|\s//g" > output.tmp


