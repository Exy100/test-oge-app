n = int(input())
total = 0
for i in range(n):
    x = int(input())
    if x % 7 == 1:
        total += x
print(total)
