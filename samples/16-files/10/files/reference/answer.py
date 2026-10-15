n = int(input())
count = 0
total = 0
if n == 0:
    count = 1
while n > 0:
    digit = n % 10
    if digit % 8 == 0:
        count += 1
        total += digit
    n //= 10
print(count, total)
